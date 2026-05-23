import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WaService } from './wa.service';
import {
  SendPollDto,
  SendTextDto,
  SimulateMessageDto,
  SimulateVoteDto,
} from './dto/send.dto';

// NOTE: These routes are unauthenticated for now. The moderator auth guard is
// added in Phase 5; the send-* routes are test utilities for Phase 1.
@Controller('wa')
export class WaController {
  constructor(
    private readonly wa: WaService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  status() {
    return this.wa.getState();
  }

  @Get('qr')
  qr() {
    const dataUrl = this.wa.getQrDataUrl();
    if (!dataUrl) {
      // No QR currently (already authenticated, or still initialising).
      return { dataUrl: null, state: this.wa.getState() };
    }
    return { dataUrl };
  }

  @Get('groups')
  async groups() {
    this.assertReady();
    return this.wa.listGroups();
  }

  @Post('send-text')
  @HttpCode(HttpStatus.OK)
  async sendText(@Body() dto: SendTextDto) {
    this.assertReady();
    const messageId = await this.wa.sendText(dto.chatId, dto.text);
    return { messageId };
  }

  @Post('send-poll')
  @HttpCode(HttpStatus.OK)
  async sendPoll(@Body() dto: SendPollDto) {
    this.assertReady();
    const messageId = await this.wa.sendPoll(
      dto.chatId,
      dto.name,
      dto.options,
      dto.allowMultipleAnswers ?? false,
    );
    return { messageId, options: dto.options };
  }

  // --- dev/testing: simulate inbound events (disabled in production) ------

  @Post('simulate-vote')
  @HttpCode(HttpStatus.OK)
  simulateVote(@Body() dto: SimulateVoteDto) {
    this.assertNotProd();
    this.wa.simulateVote({
      pollMessageId: dto.pollMessageId,
      voterWid: dto.voterWid,
      selectedOptions: dto.selectedOptions,
      interactedAt: new Date(),
    });
    return { ok: true };
  }

  @Post('simulate-message')
  @HttpCode(HttpStatus.OK)
  simulateMessage(@Body() dto: SimulateMessageDto) {
    this.assertNotProd();
    this.wa.simulateMessage({
      messageId: `sim_${Date.now()}`,
      chatId: dto.chatId,
      authorWid: dto.authorWid,
      body: dto.body,
      timestamp: new Date(),
      fromMe: false,
    });
    return { ok: true };
  }

  private assertReady(): void {
    if (!this.wa.isReady()) {
      throw new HttpException(
        `WhatsApp not ready (status=${this.wa.getState().status})`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private assertNotProd(): void {
    if (this.config.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('Simulation endpoints are disabled in production');
    }
  }
}
