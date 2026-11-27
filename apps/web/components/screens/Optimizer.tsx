'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { StrataChart } from '@/components/StrataChart';
import { Card, ClassTag, Kpi, NoData } from '@/components/ui';
import { planChart } from '@/lib/charts';
import { blockTime, inr, istDay, num } from '@/lib/format';
import { postJson, useMe } from '@/lib/useMe';
import { usePoll } from '@/lib/usePoll';

interface Opt {
  date: string;
  dates: string[];
  start: string;
  end: string;
  targetKw: number;
  startBlock: number;
  endBlock: number;
  p50: Array<number | null>;
  p90: Array<number | null>;
  plan: {
    actions: Array<{ assetId: string; action: string; expectKw: number }>;
    precondition: { leadMin: number; actions: Array<{ assetId: string }> } | null;
    expectedKw: number;
    reliefKva: number;
    meetsTarget: boolean;
    needsMedicalSuperintendent: boolean;
    forecastPeakKva: number | null;
    plannedPeakKva: number | null;
    excluded: Array<{ id: string; why: string }>;
    skipped: Array<{ id: string; why: string }>;
  };
  plannedPeakP90: number | null;
  assets: Array<{ id: string; name: string; drClass: string; flexKw: number; rebound: string }>;
  monthMdKva: number;
  avoidedInr: number | null;
  floorKva: number;
  demandRate: number;
  ladder: { stage1: number; ceiling: number; sanction: number };
  armBy: string;
  likeDays: string[];
}

const TIMES = Array.from({ length: 96 }, (_, k) => blockTime(k + 1).slice(0, 5)).concat(['24:00']);
const ACTION_TEXT: Record<string, string> = { shed: 'Hold', setpoint: 'Raise chilled-water set point' };

/** DR optimizer: choose a window and target, see the plan ergOS would run and its value, then send it for approval. */
export function OptimizerScreen() {
  const router = useRouter();
  const me = useMe();
  const [q, setQ] = useState<{ date?: string; start?: string; end?: string; target?: number }>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const url = `/api/optimizer?${new URLSearchParams(
    Object.entries(q)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString()}`;
  const r = usePoll<Opt>(url, 0);
  const o = r.data;
  const name = (id: string) => o?.assets.find((a) => a.id === id)?.name ?? id;
  const chart = useMemo(() => {
    if (!o) return null;
    const relief = o.plan.reliefKva;
    const rows = o.p50.map((v, k) => ({
      date: o.date,
      blockNo: k + 1,
      without: v,
      with: v === null ? null : k + 1 >= o.startBlock && k + 1 <= o.endBlock ? v - relief : v,
    }));
    return planChart(rows, o.ladder, {
      title: `${istDay(`${o.date}T12:00:00+05:30`)} · forecast P50 with and without the plan`,
      band: { start: `${o.date}T${o.start}`, end: `${o.date}T${o.end}`, label: 'Event' },
    });
  }, [o]);
  if (!o)
    return (
      <Card title="DR optimizer">
        {r.error ? <NoData what="forecast" why={r.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const canPropose = me && ['facility_manager', 'joulewise_ops'].includes(me.role);
  const verdict = !o.plan.actions.length
    ? 'No non-clinical load can cover this window.'
    : o.plan.meetsTarget
      ? `Meets the ${num(o.targetKw)} kW target with ${o.plan.actions.length} loads.`
      : `Falls ${num(o.targetKw - o.plan.expectedKw)} kW short of the target: every usable load is already in the plan.`;
  const propose = async () => {
    setBusy(true);
    setMsg(null);
    const res = await postJson('/api/events', { date: o.date, start: o.start, end: o.end, targetKw: o.targetKw });
    setBusy(false);
    if (res.ok) router.push(`/dispatch?event=${res.id}`);
    else setMsg(res.error ?? 'failed');
  };
  return (
    <>
      <Card
        title="Demand response simulator"
        aside={<span className="pill">Scenario only · not a dispatch command</span>}
      >
        <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
          <label className="stack">
            <span className="ttl-s">Day</span>
            <select value={o.date} onChange={(e) => setQ({ ...q, date: e.target.value })}>
              {o.dates.map((d) => (
                <option key={d} value={d}>
                  {istDay(`${d}T12:00:00+05:30`)}
                </option>
              ))}
            </select>
          </label>
          <label className="stack">
            <span className="ttl-s">From</span>
            <select value={o.start} onChange={(e) => setQ({ ...q, start: e.target.value })}>
              {TIMES.slice(0, 96).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="stack">
            <span className="ttl-s">To</span>
            <select value={o.end} onChange={(e) => setQ({ ...q, end: e.target.value })}>
              {TIMES.slice(1).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="stack" style={{ minWidth: 260 }}>
            <span className="ttl-s">Target reduction · {num(o.targetKw)} kW</span>
            <input
              type="range"
              min={10}
              max={250}
              step={5}
              value={o.targetKw}
              onChange={(e) => setQ({ ...q, target: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="note">{verdict}</div>
      </Card>
      <div className="grid-k">
        <Kpi
          title="Held back"
          value={num(o.plan.expectedKw)}
          unit="kW"
          tone={o.plan.meetsTarget ? 'lime' : 'alert'}
          foot={<span>of {num(o.targetKw)} kW target</span>}
        />
        <Kpi
          title="Day's peak, P50"
          value={num(o.plan.forecastPeakKva ?? Number.NaN)}
          unit="kVA"
          foot={
            <span>
              after the plan {num(o.plan.plannedPeakKva ?? Number.NaN)} kVA · P90 {num(o.plannedPeakP90 ?? Number.NaN)}
            </span>
          }
        />
        <Kpi
          title="Demand charge avoided"
          value={o.avoidedInr === null ? '–' : inr(o.avoidedInr)}
          tone="mint"
          foot={
            <span>
              month peak so far {num(o.monthMdKva)} kVA · floor {num(o.floorKva)}
            </span>
          }
        />
        <Kpi title="Clinical loads touched" value="0" foot={<span>{o.plan.excluded.length} excluded by class</span>} />
      </div>
      <Card title="Grid demand on the day" pad="pad-l">
        {chart ? (
          <StrataChart options={chart} minHeight={300} label="Grid kVA forecast with and without the DR plan" />
        ) : null}
        <div className="note">
          Forecast from like days {o.likeDays.slice(-3).join(', ')}
          {o.likeDays.length > 3 ? ' and earlier' : ''}. Value is the ₹{num(o.demandRate)} a kVA demand charge on the
          month's peak above the {num(o.floorKva)} kVA floor; the tariff has no time-of-day rate, so shifted energy
          alone earns nothing.
        </div>
      </Card>
      <div className="grid-2">
        <Card title="Dispatch order" aside={<span className="note">Least clinical impact first</span>}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Load</th>
                <th>Action</th>
                <th>kW</th>
                <th>Rebound</th>
              </tr>
            </thead>
            <tbody>
              {o.plan.precondition?.actions.map((p) => (
                <tr key={`pre-${p.assetId}`}>
                  <td>{name(p.assetId)}</td>
                  <td>Pre-charge {o.plan.precondition?.leadMin} min before</td>
                  <td>–</td>
                  <td>None</td>
                </tr>
              ))}
              {o.plan.actions.map((x) => (
                <tr key={x.assetId}>
                  <td>{name(x.assetId)}</td>
                  <td>{ACTION_TEXT[x.action] ?? x.action}</td>
                  <td>{num(x.expectKw)}</td>
                  <td>{o.assets.find((a) => a.id === x.assetId)?.rebound}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {o.plan.skipped.length ? (
            <div className="note">Not used: {o.plan.skipped.map((s) => `${name(s.id)} (${s.why})`).join('; ')}.</div>
          ) : null}
        </Card>
        <Card
          title="Approval"
          aside={<span className="note">Duty engineer arms by {o.armBy}, or the event lapses</span>}
        >
          <ol className="stack" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Proposed by ergOS with this plan</li>
            <li>Facility manager approves</li>
            <li>
              Medical superintendent signs ·{' '}
              {o.plan.needsMedicalSuperintendent ? 'needed: the plan touches HVAC' : 'not needed for this plan'}
            </li>
            <li>Duty engineer arms</li>
          </ol>
          <div>
            <div className="ttl-s">Never in any plan</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {o.plan.excluded.map((e) => (
                <span key={e.id} className="row" style={{ gap: 4 }}>
                  {name(e.id)} <ClassTag cls={o.assets.find((a) => a.id === e.id)?.drClass ?? 'critical'} />
                </span>
              ))}
            </div>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn-green"
              disabled={!canPropose || busy || !o.plan.actions.length}
              onClick={propose}
            >
              {busy ? 'Sending…' : 'Send for approval'}
            </button>
            {!canPropose && me ? (
              <span className="note">Only the facility manager or jouleWise operations can propose events.</span>
            ) : null}
          </div>
          {msg ? (
            <div className="note" role="alert">
              {msg}
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
