import { waTimestampToDate } from './wa.service';

describe('waTimestampToDate', () => {
  it('treats large values as milliseconds (PollVote.interractedAtTs)', () => {
    // Regression: this ms value was previously *1000 -> year 58357 -> Prisma crash.
    const ms = 1_747_894_165_000; // ~2025-05-22 in milliseconds
    const d = waTimestampToDate(ms);
    expect(d.getUTCFullYear()).toBe(2025);
  });

  it('treats small values as seconds (message.timestamp)', () => {
    const seconds = 1_747_894_165; // same instant, in seconds
    const d = waTimestampToDate(seconds);
    expect(d.getUTCFullYear()).toBe(2025);
  });

  it('never produces an out-of-range year for either unit', () => {
    for (const v of [1_747_894_165, 1_747_894_165_000]) {
      expect(waTimestampToDate(v).getUTCFullYear()).toBeLessThan(3000);
    }
  });

  it('falls back to now for invalid input', () => {
    const before = Date.now();
    const d = waTimestampToDate(undefined);
    expect(d.getTime()).toBeGreaterThanOrEqual(before);
    expect(waTimestampToDate(0).getTime()).toBeGreaterThanOrEqual(before);
    expect(waTimestampToDate(NaN).getTime()).toBeGreaterThanOrEqual(before);
  });
});
