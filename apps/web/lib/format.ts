/** Display formatters (en-IN). Numbers come from the API; these only format them. */
const nf = (d: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });

export const num = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '–' : nf(d).format(v);

/** ₹ with lakh/crore words above ₹1 lakh. */
export function inr(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e7) return `${sign}₹${nf(2).format(a / 1e7)} Cr`;
  if (a >= 1e5) return `${sign}₹${nf(2).format(a / 1e5)} L`;
  return `${sign}₹${nf(0).format(a)}`;
}

export function istTime(iso: string | Date | null | undefined): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function istDay(iso: string | Date | null | undefined): string {
  if (!iso) return '–';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );
}

/** "HH:mm" of an IST block number 1..96 (start of block). */
export const blockTime = (n: number) =>
  `${String(Math.floor((n - 1) / 4)).padStart(2, '0')}:${String(((n - 1) % 4) * 15).padStart(2, '0')}`;

/** IST wall-clock string "YYYY-MM-DDTHH:mm" for Strata's date column. */
export function istStamp(d: Date | string): string {
  const t = new Date(new Date(d).getTime() + 330 * 60000).toISOString();
  return t.slice(0, 16);
}
