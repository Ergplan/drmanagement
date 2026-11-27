/** Minimal server-rendered SVG charts for PDFs (Strata runs in the browser; a PDF needs static output). */
export function LineChart({
  series,
  lines = [],
  height = 160,
  yLabel,
  xLabels,
}: {
  series: Array<{ label: string; color: string; values: Array<number | null>; dash?: string }>;
  lines?: Array<{ label: string; value: number; color: string }>;
  height?: number;
  yLabel: string;
  xLabels: string[];
}) {
  const W = 700;
  const H = height;
  const pad = { l: 40, r: 8, t: 8, b: 20 };
  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), ...lines.map((l) => l.value)];
  const max = Math.max(1, ...all) * 1.08;
  const n = Math.max(1, ...series.map((s) => s.values.length));
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const path = (vals: Array<number | null>) =>
    vals.reduce(
      (d, v, i) =>
        v === null
          ? d
          : `${d}${d && vals[i - 1] !== null && vals[i - 1] !== undefined ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`,
      '',
    );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((max / 1.08) * f));
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${yLabel} chart`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e6ece6" />
            <text x={pad.l - 4} y={y(t) + 3} fontSize="9" textAnchor="end" fill="#4b6457">
              {t}
            </text>
          </g>
        ))}
        {xLabels.map((l, i) =>
          l ? (
            <text
              key={`${l}-${i.toString()}`}
              x={x((i / Math.max(1, xLabels.length - 1)) * (n - 1))}
              y={H - 6}
              fontSize="9"
              textAnchor="middle"
              fill="#4b6457"
            >
              {l}
            </text>
          ) : null,
        )}
        {lines.map((l) => (
          <line
            key={l.label}
            x1={pad.l}
            x2={W - pad.r}
            y1={y(l.value)}
            y2={y(l.value)}
            stroke={l.color}
            strokeDasharray="5 4"
          />
        ))}
        {series.map((s) => (
          <path
            key={s.label}
            d={path(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.8}
            strokeDasharray={s.dash}
          />
        ))}
      </svg>
      <figcaption className="rp-note">
        {yLabel} · {[...series.map((s) => s.label), ...lines.map((l) => `${l.label} ${l.value}`)].join(' · ')}
      </figcaption>
    </figure>
  );
}
