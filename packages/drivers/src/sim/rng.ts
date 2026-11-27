/** Deterministic randomness: the same seed and time give the same hospital. */
export function hash32(...xs: number[]): number {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    h ^= x >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
  }
  return h >>> 0;
}

/** Uniform [0,1) from integers. */
export function u01(...xs: number[]): number {
  return hash32(...xs) / 4294967296;
}

/** Standard normal from integers (Box–Muller). */
export function gauss(...xs: number[]): number {
  const a = Math.max(1e-12, u01(...xs, 1));
  const b = u01(...xs, 2);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}
