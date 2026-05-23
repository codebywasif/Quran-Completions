import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import { promises as fsp } from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { Client, LocalAuth, Poll } from 'whatsapp-web.js';

/**
 * Convert a WhatsApp timestamp to a Date. WhatsApp uses seconds in some places
 * (message.timestamp) and milliseconds in others (PollVote.interractedAtTs), so
 * detect by magnitude rather than assuming. Falls back to "now" if invalid.
 */
export function waTimestampToDate(ts: unknown): Date {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date();
  const ms = n > 1e11 ? n : n * 1000; // > ~1e11 ⇒ already milliseconds
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export type WaStatus =
  | 'DISABLED'
  | 'INITIALIZING'
  | 'QR'
  | 'AUTHENTICATED'
  | 'READY'
  | 'DISCONNECTED'
  | 'AUTH_FAILURE';

/** A poll vote received from WhatsApp, normalised for downstream consumers. */
export interface WaVoteUpdate {
  /** Serialized id of the poll-creation message (correlates to our WaPoll). */
  pollMessageId: string;
  /** The voter's WhatsApp id (may be "...@c.us" or "...@lid"). */
  voterWid: string;
  /** Currently-selected option labels ([] means the voter cleared their vote). */
  selectedOptions: string[];
  interactedAt: Date;
}

/** An inbound group/chat text message, normalised for the reply fallback. */
export interface WaIncomingMessage {
  messageId: string;
  chatId: string;
  authorWid: string;
  body: string;
  timestamp: Date;
  fromMe: boolean;
}

export interface WaGroup {
  id: string;
  name: string;
  participantCount: number;
}

/**
 * Owns the single whatsapp-web.js session. Sends text and polls, exposes the
 * QR / connection status for the dashboard, and republishes inbound votes and
 * messages as RxJS streams for the domain layer to consume.
 */
@Injectable()
export class WaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WaService.name);
  private client: Client | null = null;

  private status: WaStatus = 'INITIALIZING';
  private qrString: string | null = null;
  private qrDataUrl: string | null = null;
  private meWid: string | null = null;
  private lastError: string | null = null;

  private destroyed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Serial send queue enforcing a minimum gap between sends (ban-risk control).
  private sendChain: Promise<unknown> = Promise.resolve();
  private readonly minSendGapMs = 1200;

  /** Inbound poll votes (Phase 3 ingestion subscribes here). */
  readonly votes$ = new Subject<WaVoteUpdate>();
  /** Inbound text messages (Phase 3 "done"-reply fallback subscribes here). */
  readonly messages$ = new Subject<WaIncomingMessage>();

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('WA_DISABLED') === 'true') {
      this.status = 'DISABLED';
      this.logger.warn('WhatsApp client disabled via WA_DISABLED=true');
      return;
    }
    await this.initialize();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.safeDestroy();
  }

  // --- lifecycle ----------------------------------------------------------

  private async initialize(): Promise<void> {
    this.status = 'INITIALIZING';
    this.lastError = null;

    const dataPath = this.config.get<string>('WA_SESSION_PATH') ?? './.wwebjs_auth';
    // Remove stale Chromium profile locks left by an unclean shutdown so the
    // browser can relaunch after a container restart.
    await this.clearChromiumLocks(dataPath);
    const execPath = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');
    const webVersion = this.config.get<string>('WA_WEB_VERSION');
    const webVersionCacheUrl = this.config.get<string>('WA_WEB_VERSION_CACHE_URL');

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath }),
      puppeteer: {
        headless: true,
        executablePath: execPath && execPath.length > 0 ? execPath : undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      },
      // Pin the WhatsApp Web build to stabilise poll-vote decryption.
      ...(webVersion ? { webVersion } : {}),
      ...(webVersionCacheUrl
        ? {
            webVersionCache: {
              type: 'remote' as const,
              remotePath: webVersionCacheUrl,
            },
          }
        : {}),
    });

    this.wireEvents(client);
    this.client = client;

    client.initialize().catch((err: unknown) => {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize WhatsApp client: ${this.lastError}`);
      this.scheduleReconnect();
    });
  }

  private wireEvents(client: Client): void {
    client.on('qr', (qr: string) => {
      this.status = 'QR';
      this.qrString = qr;
      QRCode.toDataURL(qr)
        .then((url) => (this.qrDataUrl = url))
        .catch(() => (this.qrDataUrl = null));
      this.logger.log('QR code received — scan it from the dashboard to log in');
    });

    client.on('authenticated', () => {
      this.status = 'AUTHENTICATED';
      this.qrString = null;
      this.qrDataUrl = null;
      this.logger.log('WhatsApp authenticated');
    });

    client.on('auth_failure', (msg: string) => {
      this.status = 'AUTH_FAILURE';
      this.lastError = msg;
      this.logger.error(`WhatsApp auth failure: ${msg}`);
    });

    client.on('ready', () => {
      this.status = 'READY';
      this.qrString = null;
      this.qrDataUrl = null;
      this.meWid = client.info?.wid?._serialized ?? null;
      this.logger.log(`WhatsApp client ready (as ${this.meWid ?? 'unknown'})`);
    });

    client.on('disconnected', (reason: string) => {
      this.status = 'DISCONNECTED';
      this.lastError = `disconnected: ${reason}`;
      this.logger.warn(`WhatsApp disconnected: ${reason}`);
      this.scheduleReconnect();
    });

    client.on('vote_update', (vote: any) => {
      try {
        const update: WaVoteUpdate = {
          pollMessageId:
            vote?.parentMessage?.id?._serialized ??
            vote?.parentMessage?.id?.id ??
            '',
          voterWid: String(vote?.voter ?? ''),
          selectedOptions: Array.isArray(vote?.selectedOptions)
            ? vote.selectedOptions.map((o: any) => String(o?.name ?? ''))
            : [],
          interactedAt: waTimestampToDate(vote?.interractedAtTs),
        };
        this.logger.log(
          `vote_update: voter=${update.voterWid} poll=${update.pollMessageId} -> [${update.selectedOptions.join(', ')}]`,
        );
        this.votes$.next(update);
      } catch (err) {
        this.logger.error(`Failed to handle vote_update: ${String(err)}`);
      }
    });

    client.on('message', (msg: any) => {
      try {
        const incoming: WaIncomingMessage = {
          messageId: msg?.id?._serialized ?? '',
          chatId: String(msg?.from ?? ''),
          authorWid: String(msg?.author ?? msg?.from ?? ''),
          body: String(msg?.body ?? ''),
          timestamp: waTimestampToDate(msg?.timestamp),
          fromMe: Boolean(msg?.fromMe),
        };
        this.messages$.next(incoming);
      } catch (err) {
        this.logger.error(`Failed to handle message: ${String(err)}`);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectTimer) return;
    const delayMs = 15_000;
    this.logger.warn(`Reconnecting WhatsApp client in ${delayMs / 1000}s…`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void (async () => {
        await this.safeDestroy();
        if (!this.destroyed) await this.initialize();
      })();
    }, delayMs);
  }

  /**
   * Delete Chromium singleton lock files left in the LocalAuth profile by an
   * unclean shutdown — otherwise a recreated container can't relaunch the
   * browser ("profile appears to be in use by another Chromium process").
   */
  private async clearChromiumLocks(dataPath: string): Promise<void> {
    const lockNames = new Set([
      'SingletonLock',
      'SingletonSocket',
      'SingletonCookie',
    ]);
    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 3) return;
      let entries: import('fs').Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full, depth + 1);
        } else if (lockNames.has(entry.name)) {
          // SingletonLock is usually a symlink; rm with force handles both.
          try {
            await fsp.rm(full, { force: true });
            this.logger.warn(`Removed stale Chromium lock: ${full}`);
          } catch {
            // ignore
          }
        }
      }
    };
    await walk(dataPath, 0);
  }

  private async safeDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.destroy();
    } catch {
      // ignore
    }
    this.client = null;
  }

  // --- public API ---------------------------------------------------------

  getState(): {
    status: WaStatus;
    me: string | null;
    hasQr: boolean;
    error: string | null;
  } {
    return {
      status: this.status,
      me: this.meWid,
      hasQr: Boolean(this.qrDataUrl),
      error: this.lastError,
    };
  }

  getQrDataUrl(): string | null {
    return this.qrDataUrl;
  }

  /** Dev/testing: pretend sends succeed (returns synthetic ids), no client. */
  private get fakeSend(): boolean {
    return (
      process.env.WA_FAKE_SEND === 'true' &&
      process.env.NODE_ENV !== 'production'
    );
  }

  private fakeId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  isReady(): boolean {
    return this.fakeSend || (this.status === 'READY' && this.client !== null);
  }

  private requireReady(): Client {
    if (!this.client || this.status !== 'READY') {
      throw new Error(`WhatsApp client not ready (status=${this.status})`);
    }
    return this.client;
  }

  /** Serialise sends with a minimum gap to reduce ban risk. */
  private enqueueSend<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.sendChain.then(async () => {
      const result = await fn();
      await new Promise((r) => setTimeout(r, this.minSendGapMs));
      return result;
    });
    this.sendChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Send a plain text message; returns the serialized message id. */
  async sendText(chatId: string, text: string): Promise<string> {
    if (this.fakeSend) {
      this.logger.log(`[FAKE] sendText -> ${chatId}: ${text.slice(0, 80)}…`);
      return this.fakeId('fake_text');
    }
    const client = this.requireReady();
    return this.enqueueSend(async () => {
      const msg = await client.sendMessage(chatId, text);
      return msg.id._serialized;
    });
  }

  /** Send a poll; returns the serialized message id (for vote correlation). */
  async sendPoll(
    chatId: string,
    name: string,
    options: string[],
    allowMultipleAnswers = false,
  ): Promise<string> {
    if (this.fakeSend) {
      this.logger.log(
        `[FAKE] sendPoll -> ${chatId}: "${name}" [${options.join(', ')}]`,
      );
      return this.fakeId('fake_poll');
    }
    const client = this.requireReady();
    return this.enqueueSend(async () => {
      // `messageSecret` must be present in the type even when left undefined
      // (the library generates one). See whatsapp-web.js PollSendOptions.
      const poll = new Poll(name, options, {
        allowMultipleAnswers,
        messageSecret: undefined,
      });
      const msg = await client.sendMessage(chatId, poll);
      return msg.id._serialized;
    });
  }

  /** List the groups this account is a member of. */
  async listGroups(): Promise<WaGroup[]> {
    const client = this.requireReady();
    const chats = await client.getChats();
    return chats
      .filter((c: any) => c.isGroup)
      .map((c: any) => ({
        id: c.id?._serialized ?? '',
        name: c.name ?? '(unnamed)',
        participantCount: Array.isArray(c.participants)
          ? c.participants.length
          : (c.groupMetadata?.participants?.length ?? 0),
      }));
  }

  /**
   * Resolve a voter id to its phone "...@c.us" form. WhatsApp delivers some
   * group voters as "...@lid" (linked-device ids) rather than phone numbers;
   * this maps them back via getContactLidAndPhone. Best-effort: returns the
   * input if already a phone, or null if it can't be resolved.
   */
  async resolvePhone(wid: string): Promise<string | null> {
    if (!wid) return null;
    if (wid.endsWith('@c.us')) return wid;
    if (!wid.endsWith('@lid')) return null;
    if (this.fakeSend || !this.client || this.status !== 'READY') return null;
    try {
      const pairs = await this.client.getContactLidAndPhone([wid]);
      const arr = Array.isArray(pairs) ? pairs : [];
      const match = arr.find((p) => p?.lid === wid) ?? arr[0];
      const pn = match?.pn ? String(match.pn) : '';
      if (!pn) return null;
      if (pn.includes('@')) return pn;
      const digits = pn.replace(/[^\d]/g, '');
      return digits.length > 0 ? `${digits}@c.us` : null;
    } catch (err) {
      this.logger.warn(`resolvePhone failed for ${wid}: ${String(err)}`);
      return null;
    }
  }

  /** Push a synthetic vote into the pipeline (testing/dev only). */
  simulateVote(update: WaVoteUpdate): void {
    this.votes$.next(update);
  }

  /** Push a synthetic inbound message into the pipeline (testing/dev only). */
  simulateMessage(msg: WaIncomingMessage): void {
    this.messages$.next(msg);
  }

  /** List a group's participants (id + admin flags). */
  async getGroupParticipants(
    groupId: string,
  ): Promise<{ id: string; isAdmin: boolean }[]> {
    const client = this.requireReady();
    const chat: any = await client.getChatById(groupId);
    const participants = Array.isArray(chat?.participants) ? chat.participants : [];
    return participants.map((p: any) => ({
      id: p.id?._serialized ?? '',
      isAdmin: Boolean(p.isAdmin || p.isSuperAdmin),
    }));
  }
}
