'use client';
import { useState } from 'react';
import { Bar, Card, ClassTag, Kpi, NoData } from '@/components/ui';
import { num } from '@/lib/format';
import { usePoll } from '@/lib/usePoll';

interface Asset {
  id: string;
  name: string;
  drClass: string;
  ratedFlexKw: number;
  flexKwNow: number;
  limits: {
    action?: string;
    never?: string;
    minimum_service?: string;
    rebound?: string;
    max_duration?: string;
    response_time?: string;
    flex_kw?: { nov_evening: number; jun_evening: number };
  };
  authority: string | null;
  interlock: string | null;
  profile: number[];
  kwNow: number | null;
  equipment: Array<{ name: string; rating: string | null }>;
}

const CLASSES = [
  ['flexible', 'Can pause or move. Comes back with no effect on patients.'],
  ['conditional', 'Can trim inside set limits, for a short time.'],
  ['protected', 'Clinical air. ergOS watches it and never changes it.'],
  ['critical', 'Life-critical. Wired out of every control.'],
] as const;

/** Flexibility registry: what each load can give, its limits and authority, and the clinical classes. */
export function FlexibilityScreen() {
  const r = usePoll<{ month: number; assets: Asset[] }>('/api/flexibility', 15000);
  const [sel, setSel] = useState<string | null>(null);
  if (!r.data)
    return (
      <Card title="Load flexibility">
        {r.error ? <NoData what="assets" why={r.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const assets = r.data.assets;
  const usable = assets.filter((a) => (a.drClass === 'flexible' || a.drClass === 'conditional') && a.flexKwNow > 0);
  const total = usable.reduce((s, a) => s + a.flexKwNow, 0);
  const rated = assets.reduce(
    (s, a) => s + (a.drClass === 'flexible' || a.drClass === 'conditional' ? a.ratedFlexKw : 0),
    0,
  );
  const a = assets.find((x) => x.id === (sel ?? usable[0]?.id ?? assets[0]?.id)) ?? null;
  const summer = r.data.month >= 4 && r.data.month <= 9;
  const peakH = Math.max(1, ...(a?.profile ?? [1]));
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Can be held back this evening"
          value={num(total)}
          unit="kW"
          tone="lime"
          foot={
            <span>
              {summer ? 'Summer values: cooling gives the most room' : 'Winter values: little cooling to trim'}
            </span>
          }
        />
        <Kpi title="Rated flexibility" value={num(rated)} unit="kW" foot={<span>At a June evening peak</span>} />
        <Kpi
          title="Assets used"
          value={num(usable.length)}
          unit={`of ${assets.filter((x) => x.drClass === 'flexible' || x.drClass === 'conditional').length}`}
        />
        <Kpi
          title="Patient areas touched"
          value="0"
          tone="mint"
          foot={<span>Protected and critical loads have no command path</span>}
        />
      </div>
      <div className="grid-k">
        {CLASSES.map(([cls, text]) => (
          <Card key={cls}>
            <ClassTag cls={cls} />
            <div className="note">{text}</div>
          </Card>
        ))}
      </div>
      <div className="grid-2">
        <Card title="Assets" aside={<span className="note">Select one to see inside it</span>}>
          <div className="stack">
            {assets.map((x) => (
              <button
                type="button"
                key={x.id}
                onClick={() => setSel(x.id)}
                className="glass pad"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  outline: a?.id === x.id ? '2px solid #1f7a3c' : 'none',
                  border: 0,
                }}
                aria-pressed={a?.id === x.id}
              >
                <div className="between">
                  <b>{x.name}</b>
                  <ClassTag cls={x.drClass} />
                </div>
                <div className="between note">
                  <span>{x.kwNow === null ? 'No reading' : `${num(x.kwNow)} kW now`}</span>
                  <span>
                    {x.drClass === 'flexible' || x.drClass === 'conditional'
                      ? `${num(x.flexKwNow)} kW this evening`
                      : 'Never curtailed'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </Card>
        {a ? (
          <Card title={a.name} aside={<ClassTag cls={a.drClass} />}>
            <div>
              <div className="ttl-s">What ergOS does</div>
              <div>{a.limits.action ?? '–'}</div>
            </div>
            <div>
              <div className="ttl-s">What it never does</div>
              <div>{a.limits.never ?? '–'}</div>
            </div>
            <div className="grid-2">
              <div className="kv">
                <span>November evening</span>
                <b>{num(a.limits.flex_kw?.nov_evening ?? 0)} kW</b>
              </div>
              <div className="kv">
                <span>June evening</span>
                <b>{num(a.limits.flex_kw?.jun_evening ?? 0)} kW</b>
              </div>
              <div className="kv">
                <span>Longest hold</span>
                <b>{a.limits.max_duration ?? '–'}</b>
              </div>
              <div className="kv">
                <span>Responds in</span>
                <b>{a.limits.response_time ?? '–'}</b>
              </div>
              <div className="kv">
                <span>Minimum level</span>
                <b>{a.limits.minimum_service ?? '–'}</b>
              </div>
              <div className="kv">
                <span>Rebound</span>
                <b>{a.limits.rebound ?? '–'}</b>
              </div>
              <div className="kv">
                <span>Who approves</span>
                <b>{a.authority ?? '–'}</b>
              </div>
              <div className="kv">
                <span>Safety interlock</span>
                <b>{a.interlock ?? '–'}</b>
              </div>
            </div>
            <div>
              <div className="ttl-s">A typical November day · kW by hour</div>
              <div
                className="row"
                style={{ alignItems: 'flex-end', gap: 2, height: 80 }}
                role="img"
                aria-label="Hourly kW profile"
              >
                {a.profile
                  .map((v, h) => ({ v, h }))
                  .map(({ v, h }) => (
                    <div
                      key={`h${h}`}
                      title={`${h}:00 · ${num(v)} kW`}
                      style={{
                        flex: 1,
                        height: `${(v / peakH) * 100}%`,
                        minHeight: 2,
                        background: h >= 17 && h < 20 ? '#b4541a' : '#1f7a3c',
                        borderRadius: 3,
                      }}
                    />
                  ))}
              </div>
              <div className="between note">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>17:30 peak</span>
                <span>24</span>
              </div>
            </div>
            {a.equipment.length ? (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Equipment</th>
                    <th>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {a.equipment.map((e) => (
                    <tr key={e.name}>
                      <td>{e.name}</td>
                      <td>{e.rating ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {a.ratedFlexKw > 0 ? (
              <Bar pct={(a.flexKwNow / a.ratedFlexKw) * 100} label="Share of rated flexibility available now" />
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}
