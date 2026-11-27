import type { ReactNode } from 'react';

export function Kpi({
  title,
  value,
  unit,
  foot,
  tone,
  icon,
}: {
  title: string;
  value: string;
  unit?: string;
  foot?: ReactNode;
  tone?: 'lilac' | 'lime' | 'mint' | 'alert';
  icon?: string;
}) {
  return (
    <div className={`glass kpi ${tone ? `glass-${tone}` : ''}`}>
      <div className="kpi-head">
        <span>{title}</span>
        {icon ? (
          <span className="ico" aria-hidden="true">
            {/* biome-ignore lint/performance/noImgElement: small static SVG icon */}
            <img src={icon} alt="" width={20} height={20} />
          </span>
        ) : null}
      </div>
      <div className="num-l">
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
      {foot ? <div className="trend">{foot}</div> : null}
    </div>
  );
}

export function Card({
  title,
  aside,
  children,
  tone,
  pad = 'pad',
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  tone?: 'lilac' | 'lime' | 'mint' | 'alert';
  pad?: 'pad' | 'pad-l';
}) {
  return (
    <section className={`glass ${pad} stack ${tone ? `glass-${tone}` : ''}`}>
      {title || aside ? (
        <div className="between">
          {title ? <div className="ttl">{title}</div> : <span />}
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function NoData({ what, why }: { what: string; why?: string | null }) {
  return (
    <div className="note" role="status">
      No {what} yet{why ? ` (${why})` : ''}. Values appear once the edge gateway is uplinking.
    </div>
  );
}

const TAG: Record<string, string> = {
  flexible: 'tag-flex',
  conditional: 'tag-cond',
  protected: 'tag-prot',
  critical: 'tag-crit',
  meter: '',
};
export function ClassTag({ cls }: { cls: string }) {
  return (
    <span className={`tag ${TAG[cls] ?? ''}`}>{cls === 'meter' ? 'Meter' : cls[0]!.toUpperCase() + cls.slice(1)}</span>
  );
}

export function Bar({ pct, color = '#1f7a3c', label }: { pct: number; color?: string; label: string }) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ height: 10, borderRadius: 999, background: 'rgba(16,35,26,.08)', overflow: 'hidden' }}
    >
      <div
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 999 }}
      />
    </div>
  );
}
