/**
 * Pure Juz-allocation algorithm (no DB / framework deps so it is trivially
 * unit-testable). Given each member's pledged Juz count and any specific Juz
 * requests, it assigns concrete (Quran, Juz) slots across the week.
 *
 * A "Quran" is 30 Juz. Slots are filled in order: Quran 1 Juz 1..30, Quran 2
 * Juz 1..30, … up to the total pledged Juz. Specific requests are honoured
 * first; the remainder is filled sequentially, grouping each member's slots
 * together where possible (so a person tends to get consecutive Juz).
 */

export const JUZ_PER_QURAN = 30;

export interface AllocationMemberInput {
  memberId: string;
  /** Pledged number of Juz (the "5+" option is expanded before this point). */
  juzCount: number;
  /** Optional specific Juz numbers (1..30) the member asked for. */
  requestedJuz?: number[];
}

export interface AllocatedSlot {
  quranNumber: number; // 1-based
  juzNumber: number; // 1..30
  memberId: string;
}

export interface AllocationResult {
  slots: AllocatedSlot[];
  totalJuz: number;
  quranCount: number;
  /** True when totalJuz is a clean multiple of 30 (no partial final Quran). */
  complete: boolean;
  /** How many of the final Quran's 30 Juz are unfilled (0 when complete). */
  unfilledInLastQuran: number;
  warnings: string[];
}

interface WorkingMember {
  memberId: string;
  remaining: number;
  requestedJuz: number[];
}

/**
 * Allocate Juz slots for a week. Deterministic: members are processed in the
 * order given, so callers control tie-breaking by ordering the input.
 */
export function allocateJuz(
  members: AllocationMemberInput[],
): AllocationResult {
  const warnings: string[] = [];

  const working: WorkingMember[] = members.map((m) => {
    const requested = (m.requestedJuz ?? []).filter((j) => {
      const valid = Number.isInteger(j) && j >= 1 && j <= JUZ_PER_QURAN;
      if (!valid) {
        warnings.push(
          `Ignored invalid requested Juz ${j} for member ${m.memberId} (must be 1-30).`,
        );
      }
      return valid;
    });
    // A member's effective capacity is at least the number of Juz they asked
    // for (honour all explicit requests even if it exceeds the pledged count).
    const remaining = Math.max(Math.max(0, Math.trunc(m.juzCount)), requested.length);
    if (requested.length > Math.max(0, Math.trunc(m.juzCount))) {
      warnings.push(
        `Member ${m.memberId} requested ${requested.length} Juz but pledged ${m.juzCount}; using ${remaining}.`,
      );
    }
    return { memberId: m.memberId, remaining, requestedJuz: requested };
  });

  const totalJuz = working.reduce((sum, m) => sum + m.remaining, 0);
  const quranCount = Math.ceil(totalJuz / JUZ_PER_QURAN);

  // Build the empty slot grid, capped at exactly totalJuz slots.
  const slots: AllocatedSlot[] = [];
  const filled: boolean[] = [];
  for (let q = 1; q <= quranCount && slots.length < totalJuz; q++) {
    for (let j = 1; j <= JUZ_PER_QURAN && slots.length < totalJuz; j++) {
      slots.push({ quranNumber: q, juzNumber: j, memberId: '' });
      filled.push(false);
    }
  }

  // Step 1 — honour specific requests (earliest available slot with that Juz).
  for (const m of working) {
    for (const reqJuz of m.requestedJuz) {
      if (m.remaining <= 0) break;
      const idx = slots.findIndex(
        (s, i) => !filled[i] && s.juzNumber === reqJuz,
      );
      if (idx === -1) {
        warnings.push(
          `Could not place requested Juz ${reqJuz} for member ${m.memberId} (no free slot with that Juz).`,
        );
        continue;
      }
      slots[idx].memberId = m.memberId;
      filled[idx] = true;
      m.remaining -= 1;
    }
  }

  // Step 2 — fill the rest sequentially, grouping each member's slots together.
  let mi = 0;
  for (let i = 0; i < slots.length; i++) {
    if (filled[i]) continue;
    while (mi < working.length && working[mi].remaining <= 0) mi++;
    if (mi >= working.length) break; // no remaining capacity (shouldn't happen)
    slots[i].memberId = working[mi].memberId;
    filled[i] = true;
    working[mi].remaining -= 1;
  }

  const complete = totalJuz > 0 && totalJuz % JUZ_PER_QURAN === 0;
  const unfilledInLastQuran =
    totalJuz === 0 || complete
      ? 0
      : JUZ_PER_QURAN - (totalJuz % JUZ_PER_QURAN);
  if (!complete && totalJuz > 0) {
    warnings.push(
      `Total pledged Juz (${totalJuz}) is not a multiple of 30 — the last Quran is partial (${totalJuz % JUZ_PER_QURAN}/30, ${unfilledInLastQuran} unfilled).`,
    );
  }

  return {
    slots,
    totalJuz,
    quranCount,
    complete,
    unfilledInLastQuran,
    warnings,
  };
}
