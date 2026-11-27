/** IST 15-minute settlement blocks, numbered 1..96 from IST midnight (invariant 9). Pure, no I/O. */
export const IST_OFFSET_MIN = 330;
export const BLOCKS_PER_DAY = 96;
export const BLOCK_MIN = 15;
const BLOCK_MS = BLOCK_MIN * 60_000;

/** Block number 1..96 for an instant, in IST. */
export function blockIndexIST(at: Date): number {
  const istMin = Math.floor(at.getTime() / 60000) + IST_OFFSET_MIN;
  const minOfDay = ((istMin % 1440) + 1440) % 1440;
  return Math.floor(minOfDay / BLOCK_MIN) + 1;
}

/** Start of the IST block containing `at`, as a UTC Date. */
export function blockStartIST(at: Date): Date {
  const istMs = at.getTime() + IST_OFFSET_MIN * 60000;
  const floored = istMs - (((istMs % BLOCK_MS) + BLOCK_MS) % BLOCK_MS);
  return new Date(floored - IST_OFFSET_MIN * 60000);
}

/** IST calendar date (YYYY-MM-DD) of an instant. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

/** UTC instant of IST midnight starting the given IST date. */
export function istMidnightUTC(date: string): Date {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - IST_OFFSET_MIN * 60000);
}

/** Average kVA over a block from its kVAh (15 minutes = 1/4 h). */
export function blockKvaFromKvah(kvah: number): number {
  return kvah * (60 / BLOCK_MIN);
}

/**
 * Projected block-average kVA: energy already recorded in the block plus the current kVA held for the rest.
 * This is what the ceiling acts on (invariant 4).
 */
export function projectedBlockKva(elapsedKvah: number, elapsedMin: number, currentKva: number): number {
  const remainingMin = Math.max(0, BLOCK_MIN - elapsedMin);
  return blockKvaFromKvah(elapsedKvah + (currentKva * remainingMin) / 60);
}

/** Maximum demand over a period: the highest block-average kVA. */
export function maxDemandKva(blockKva: readonly number[]): number {
  return blockKva.reduce((m, v) => Math.max(m, v), 0);
}
