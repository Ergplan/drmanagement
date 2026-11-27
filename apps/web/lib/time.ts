/** IST display helpers. Block maths moves to packages/domain in Stage 1 (invariant 5); this is display only. */
const fmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function istParts(d: Date) {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return p as Record<string, string>;
}
