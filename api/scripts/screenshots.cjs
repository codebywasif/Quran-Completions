/*
 * Generates dashboard screenshots for the README.
 * Seeds an isolated demo week (future date, fake numbers) so the live week is
 * untouched, captures each page headlessly, then deletes the demo data.
 * Idempotent: cleans demo data before and after (try/finally).
 * Run from the api package: `node scripts/screenshots.cjs`
 */
const fs = require('fs');
const path = require('path');

// puppeteer is a transitive dep (via whatsapp-web.js); resolve from pnpm store.
function loadPuppeteer() {
  const store = path.resolve(__dirname, '../../node_modules/.pnpm');
  const dir = fs.readdirSync(store).find((d) => d.startsWith('puppeteer@'));
  if (!dir) throw new Error('puppeteer not found in pnpm store');
  return require(path.join(store, dir, 'node_modules/puppeteer'));
}
const puppeteer = loadPuppeteer();

const BASE = 'http://localhost:8080';
const API = BASE + '/api';
const OUT = path.resolve(__dirname, '../../docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const DEMO_NUMS = [
  '440000000001',
  '920000000002',
  '440000000003',
  '490000000004',
  '10000000005',
  '270000000006',
];

async function api(pathname, method = 'GET', token = null, body = null) {
  const res = await fetch(API + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${text}`);
  return json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cleanup(token) {
  const weeks = await api('/weeks', 'GET', token);
  for (const w of weeks) {
    const d = String(w.startDate);
    if (d.startsWith('2026-07-02') || d.startsWith('2026-07-03')) {
      try {
        await api('/weeks/' + w.id, 'DELETE', token);
      } catch {
        /* ignore */
      }
    }
  }
  const members = await api('/members', 'GET', token);
  for (const m of members) {
    const num = String(m.whatsappId || '').replace('@c.us', '');
    if (DEMO_NUMS.includes(num)) {
      try {
        await api('/members/' + m.id, 'DELETE', token);
      } catch {
        /* ignore */
      }
    }
  }
}

(async () => {
  const { token } = await api('/auth/login', 'POST', null, {
    username: 'admin',
    password: 'change-me',
  });

  await cleanup(token); // remove any leftovers from a prior run

  // --- seed an isolated demo week ---
  const demoMembers = [
    { displayName: 'Mohammed Sadiq', whatsappId: DEMO_NUMS[0], country: 'UK' },
    { displayName: 'Faizan', whatsappId: DEMO_NUMS[1], country: 'Pakistan' },
    { displayName: 'Hafiz Saif', whatsappId: DEMO_NUMS[2], country: 'UK' },
    { displayName: 'Hud Ahmad', whatsappId: DEMO_NUMS[3], country: 'Germany' },
    { displayName: 'Salim', whatsappId: DEMO_NUMS[4], country: 'USA (East)' },
    { displayName: 'Abdur Raheem', whatsappId: DEMO_NUMS[5], country: 'South Africa' },
  ];
  const created = [];
  for (const m of demoMembers) created.push(await api('/members', 'POST', token, m));

  const week = await api('/weeks', 'POST', token, { startDate: '2026-07-03' });
  const wid = week.id;
  const labels = ['5+', '5', '5', '5', '5', '5']; // 30 Juz = 1 Quran
  for (let i = 0; i < created.length; i++)
    await api(`/weeks/${wid}/votes`, 'PUT', token, {
      memberId: created[i].id,
      label: labels[i],
    });
  await api(`/weeks/${wid}/requests`, 'PUT', token, {
    memberId: created[2].id,
    requestedJuz: [1, 2],
  });
  await api(`/weeks/${wid}/prepare-allocation`, 'POST', token);
  await api(`/weeks/${wid}/transition`, 'POST', token, { status: 'IN_PROGRESS' });
  for (const i of [0, 2, 4])
    await api(`/weeks/${wid}/completion`, 'PUT', token, {
      memberId: created[i].id,
      completed: true,
    });

  // --- capture ---
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'shell',
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--hide-scrollbars',
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    const shot = async (route, file) => {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(2500);
      try {
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
      } catch (e) {
        console.log('fullPage failed, viewport fallback:', file, String(e.message));
        await page.screenshot({ path: path.join(OUT, file) });
      }
      console.log('captured', file);
    };

    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(1000);
    await page.screenshot({ path: path.join(OUT, 'login.png') });
    console.log('captured login.png');

    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await shot('/', 'current-week.png');
    await shot('/allocation', 'allocation.png');
    await shot('/members', 'members.png');
    await shot('/outbox', 'messages.png');
    await shot('/settings', 'settings.png');
    await shot('/history', 'history.png');
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await cleanup(token);
    console.log('done — demo data removed');
  }
})().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
