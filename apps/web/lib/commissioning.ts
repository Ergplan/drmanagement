/** The edge reads point → driver from edge.config.yaml (invariant 10); the database mirrors it for review. */
export function edgeOverrides(rows: Array<{ id: string; sourceDriver: string }>): string {
  const real = rows.filter((r) => r.sourceDriver !== 'sim');
  if (!real.length) return 'points:\n  default: sim\n  overrides: {}\n';
  return `points:\n  default: sim\n  overrides:\n${real.map((r) => `    ${r.id}: ${r.sourceDriver}`).join('\n')}\n`;
}
