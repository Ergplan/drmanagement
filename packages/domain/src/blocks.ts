/** IST 15-minute settlement blocks, numbered 1..96 from IST midnight (invariant 9). Pure, no I/O. */
export const IST_OFFSET_MIN = 330;
export const BLOCKS_PER_DAY = 96;
export const BLOCK_MIN = 15;

/** Block number 1..96 for an instant, in IST. */
export function blockIndexIST(at: Date): number {
  const istMin = Math.floor(at.getTime() / 60000) + IST_OFFSET_MIN;
  const minOfDay = ((istMin % 1440) + 1440) % 1440;
  return Math.floor(minOfDay / BLOCK_MIN) + 1;
}

/** Start of the IST block containing `at`, as a UTC Date. */
export function blockStartIST(at: Date): Date {
  const ms = at.getTime();
  const istMs = ms + IST_OFFSET_MIN * 60000;
  const floored = istMs - (((istMs % (BLOCK_MIN * 60000)) + BLOCK_MIN * 60000) % (BLOCK_MIN * 60000));
  return new Date(floored - IST_OFFSET_MIN * 60000);
}
