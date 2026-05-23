import { allocateJuz, JUZ_PER_QURAN } from './allocation.algorithm';

/** Count how many slots each member received. */
function countByMember(slots: { memberId: string }[]): Record<string, number> {
  return slots.reduce<Record<string, number>>((acc, s) => {
    acc[s.memberId] = (acc[s.memberId] ?? 0) + 1;
    return acc;
  }, {});
}

describe('allocateJuz', () => {
  it('allocates a single full Quran across members', () => {
    const res = allocateJuz([
      { memberId: 'a', juzCount: 10 },
      { memberId: 'b', juzCount: 20 },
    ]);
    expect(res.totalJuz).toBe(30);
    expect(res.quranCount).toBe(1);
    expect(res.complete).toBe(true);
    expect(res.unfilledInLastQuran).toBe(0);
    expect(res.slots).toHaveLength(30);
    expect(countByMember(res.slots)).toEqual({ a: 10, b: 20 });
    // Every slot is Quran 1, Juz 1..30, each Juz exactly once.
    expect(res.slots.map((s) => s.juzNumber)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(res.slots.every((s) => s.quranNumber === 1)).toBe(true);
  });

  it("groups each member's Juz contiguously when filling sequentially", () => {
    const res = allocateJuz([
      { memberId: 'a', juzCount: 3 },
      { memberId: 'b', juzCount: 2 },
    ]);
    expect(res.slots.map((s) => s.memberId)).toEqual([
      'a',
      'a',
      'a',
      'b',
      'b',
    ]);
    expect(res.slots.map((s) => s.juzNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('spans multiple Qurans, restarting Juz numbering each Quran', () => {
    const res = allocateJuz([{ memberId: 'a', juzCount: 60 }]);
    expect(res.totalJuz).toBe(60);
    expect(res.quranCount).toBe(2);
    expect(res.complete).toBe(true);
    expect(res.slots).toHaveLength(60);
    const q1 = res.slots.filter((s) => s.quranNumber === 1);
    const q2 = res.slots.filter((s) => s.quranNumber === 2);
    expect(q1.map((s) => s.juzNumber)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(q2.map((s) => s.juzNumber)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it('honours specific Juz requests', () => {
    const res = allocateJuz([
      { memberId: 'a', juzCount: 2, requestedJuz: [5, 6] },
      { memberId: 'b', juzCount: 28 },
    ]);
    const aSlots = res.slots.filter((s) => s.memberId === 'a');
    expect(aSlots.map((s) => s.juzNumber).sort((x, y) => x - y)).toEqual([5, 6]);
    expect(aSlots.every((s) => s.quranNumber === 1)).toBe(true);
    expect(countByMember(res.slots)).toEqual({ a: 2, b: 28 });
  });

  it('sends a second request for the same Juz to the next Quran', () => {
    const res = allocateJuz([
      { memberId: 'a', juzCount: 1, requestedJuz: [1] },
      { memberId: 'b', juzCount: 30, requestedJuz: [1] },
      { memberId: 'c', juzCount: 29 },
    ]);
    const a = res.slots.find((s) => s.memberId === 'a' && s.juzNumber === 1);
    const bJuz1 = res.slots.filter((s) => s.memberId === 'b' && s.juzNumber === 1);
    expect(a?.quranNumber).toBe(1);
    expect(bJuz1).toHaveLength(1);
    expect(bJuz1[0].quranNumber).toBe(2); // Quran 1 Juz 1 was taken by 'a'
  });

  it('flags a non-multiple-of-30 total as a partial last Quran', () => {
    const res = allocateJuz([{ memberId: 'a', juzCount: 35 }]);
    expect(res.totalJuz).toBe(35);
    expect(res.quranCount).toBe(2);
    expect(res.complete).toBe(false);
    expect(res.unfilledInLastQuran).toBe(25);
    expect(res.slots).toHaveLength(35);
    expect(res.warnings.some((w) => w.includes('not a multiple of 30'))).toBe(
      true,
    );
  });

  it('bumps effective capacity when requests exceed the pledged count', () => {
    const res = allocateJuz([
      { memberId: 'a', juzCount: 1, requestedJuz: [3, 4, 5] },
      { memberId: 'b', juzCount: 27 },
    ]);
    expect(countByMember(res.slots).a).toBe(3);
    expect(res.totalJuz).toBe(30);
    expect(res.warnings.some((w) => w.includes('requested 3 Juz'))).toBe(true);
  });

  it('ignores out-of-range requested Juz with a warning', () => {
    const res = allocateJuz([
      { memberId: 'a', juzCount: 2, requestedJuz: [0, 31, 7] },
      { memberId: 'b', juzCount: 28 },
    ]);
    const a = res.slots.filter((s) => s.memberId === 'a');
    expect(a.some((s) => s.juzNumber === 7)).toBe(true);
    expect(countByMember(res.slots).a).toBe(2);
    expect(res.warnings.filter((w) => w.includes('invalid requested Juz'))).toHaveLength(
      2,
    );
  });

  it('returns an empty allocation for zero total', () => {
    const res = allocateJuz([{ memberId: 'a', juzCount: 0 }]);
    expect(res.totalJuz).toBe(0);
    expect(res.quranCount).toBe(0);
    expect(res.slots).toHaveLength(0);
    expect(res.complete).toBe(false);
  });

  it('handles a realistic 11-Quran week with every slot assigned', () => {
    // 33 members pledging 10 each = 330 Juz = 11 Qurans.
    const members = Array.from({ length: 33 }, (_, i) => ({
      memberId: `m${i}`,
      juzCount: 10,
    }));
    const res = allocateJuz(members);
    expect(res.totalJuz).toBe(330);
    expect(res.quranCount).toBe(11);
    expect(res.complete).toBe(true);
    expect(res.slots).toHaveLength(330);
    // No empty assignments, and total per-member counts are exact.
    expect(res.slots.every((s) => s.memberId !== '')).toBe(true);
    const counts = countByMember(res.slots);
    expect(Object.values(counts).every((c) => c === 10)).toBe(true);
    // Each Quran has exactly Juz 1..30.
    for (let q = 1; q <= 11; q++) {
      const juz = res.slots
        .filter((s) => s.quranNumber === q)
        .map((s) => s.juzNumber)
        .sort((a, b) => a - b);
      expect(juz).toEqual(Array.from({ length: JUZ_PER_QURAN }, (_, i) => i + 1));
    }
  });
});
