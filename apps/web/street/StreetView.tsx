'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { StrataChart } from '@/components/StrataChart';
import { ClassTag } from '@/components/ui';
import { C, pointSeries } from '@/lib/charts';
import type { ControlResp } from '@/lib/control-types';
import { inr, istTime, num } from '@/lib/format';
import type { PointsResp } from '@/lib/types';
import { usePoll } from '@/lib/usePoll';
import { CLASS_COLOR, geometry, ordered, ROUTE } from './layout';
import type { LiveState, Mode, StreetData, StreetNode } from './types';

const Scene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => (
    <div className="note" style={{ padding: 20 }}>
      Loading the 3D scene…
    </div>
  ),
});

/** Interlock shown with each clinical node (reference/control.yaml ids). */
const NODE_INTERLOCK: Record<string, string[]> = {
  ot: ['ot-pressure', 'clinical-rh'],
  icu: ['icu-temp', 'clinical-rh'],
  isolation: ['isolation-pressure'],
  'hw-tanks': ['hot-water'],
  heatpumps: ['hot-water'],
  medgas: ['med-gas'],
  'ht-meter': ['meter-fresh'],
};

interface LiveMain {
  live: {
    kva: number;
    projectedKva: number;
    solarKw: number;
    hwSocPct: number | null;
    todayCostInr: number;
    monthMdKva: number;
    pf: number;
    source: string;
  } | null;
  ladder?: { ceiling: number; sanction: number; stage1: number };
  simulated: boolean;
}
interface EventsResp {
  events: Array<{
    id: string;
    start: string;
    end: string;
    status: string;
    plan: { actions: Array<{ assetId: string; expectKw: number }> };
  }>;
}

function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

const NAMES: Record<string, string> = {
  kw: 'Power',
  kva: 'Apparent power',
  kvar: 'Reactive power',
  pf: 'Power factor',
  tr: 'Cooling load',
  kw_per_tr: 'Efficiency',
  v_ll: 'Voltage',
  hz: 'Frequency',
  cop: 'COP',
  md_kva_month: "Month's peak",
};
const label = (pointId: string) => {
  const raw = pointId.split('.')[1] ?? pointId;
  if (NAMES[raw]) return NAMES[raw];
  const t = raw
    .replace(/_(c|pct|pa|kw|kva|kwh|wm2|l|min)$/, '')
    .replaceAll('_', ' ')
    .replace(/\bchw\b/, 'chilled water')
    .replace(/\bot(\d)\b/, 'OT $1')
    .replace(/\bkw\b/, 'kW');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function StreetView() {
  const data = usePoll<StreetData>('/api/street', 0);
  const pts = usePoll<PointsResp>('/api/live/points', 5000);
  const main = usePoll<LiveMain>('/api/live/main', 5000);
  const ctl = usePoll<ControlResp>('/api/control', 10000);
  const flex = usePoll<{ assets: Array<{ id: string; flexKwNow: number }> }>('/api/flexibility', 60000);
  const ev = usePoll<EventsResp>('/api/events', 30000);
  const [mode, setMode] = useState<Mode>('tour');
  const [selected, setSelected] = useState<string>('ht-meter');
  const [slice, setSlice] = useState<number | null>(null);
  const [night, setNight] = useState(false);
  const [lite, setLite] = useState(false);
  const [motion, setMotion] = useState(true);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [q, setQ] = useState('');
  const [bench, setBench] = useState<{ n: number; sum: number; worst: number } | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const yaw = useRef(0);

  useEffect(() => {
    setWebgl(hasWebGL2());
    const u = new URL(window.location.href);
    const n = u.searchParams.get('node');
    if (n) setSelected(n);
    const m = u.searchParams.get('mode');
    if (m === 'walk' || m === 'dollhouse' || m === 'tour') setMode(m);
    if (u.searchParams.get('lite') === '1') setLite(true);
    if (u.searchParams.get('bench') === '1') setBench({ n: 0, sum: 0, worst: 0 });
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMotion(!mq.matches);
  }, []);

  const d = data.data;
  const g = useMemo(() => (d ? geometry(d) : null), [d]);
  const nodes = useMemo(() => (d ? ordered(d.nodes) : []), [d]);
  const node = nodes.find((n) => n.id === selected) ?? nodes[0];
  const levelOf = (n: StreetNode) => g?.level.get(n.floorId) ?? 0;
  const maxLevel = mode === 'dollhouse' ? (slice ?? 6) : node ? Math.max(0, levelOf(node)) : 6;

  const select = useCallback((id: string) => {
    setSelected(id);
    const u = new URL(window.location.href);
    u.searchParams.set('node', id);
    window.history.replaceState(null, '', u.toString());
  }, []);
  const step = useCallback(
    (k: number) => {
      const i = ROUTE.indexOf(selected);
      select(ROUTE[(i + k + ROUTE.length) % ROUTE.length]!);
    },
    [selected, select],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (mode === 'walk') {
        keys.current.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        if (e.key.startsWith('Arrow')) e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === ']') step(1);
      else if (e.key === 'ArrowLeft' || e.key === '[') step(-1);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [mode, step]);

  const v = useCallback((id: string) => pts.data?.points[id]?.v, [pts.data]);
  const curtailed = useMemo(() => new Set((ctl.data?.control?.active ?? []).map((a) => a.assetId)), [ctl.data]);
  const live: LiveState = useMemo(() => ({ v, curtailed }), [v, curtailed]);

  // Walk mode: the nearest stop on the same level within 6 m becomes the selection.
  const onWalk = useCallback(
    (p: THREE.Vector3) => {
      if (!g) return;
      let best: { id: string; d: number } | null = null;
      for (const n of nodes) {
        const a = g.at(n);
        if (Math.abs(a[1] - (p.y - 1.2)) > 2) continue;
        const dist = Math.hypot(a[0] - p.x, a[2] - p.z);
        if (dist < 6 && (!best || dist < best.d)) best = { id: n.id, d: dist };
      }
      if (best && best.id !== selected) setSelected(best.id);
    },
    [g, nodes, selected],
  );
  const onFrame = useCallback(
    (ms: number) =>
      setBench((b) => (b ? { n: b.n + 1, sum: b.sum + ms, worst: b.n > 30 ? Math.max(b.worst, ms) : 0 } : b)),
    [],
  );
  useEffect(() => {
    if (bench) (window as unknown as { __streetBench: unknown }).__streetBench = bench;
  }, [bench]);

  const series = usePoll<{ rows: Array<{ ts: string; value: number }> }>(
    node ? `/api/points/${mainPoint(node)}/series` : null,
    300000,
  );
  const chart = useMemo(
    () =>
      series.data && node
        ? pointSeries(
            series.data.rows,
            `${node.title} · last 24 hours`,
            unitOf(node),
            CLASS_COLOR[node.drClass] ?? C.grid,
            170,
          )
        : null,
    [series.data, node],
  );

  if (data.error) return <div className="note">Street view needs the site data: {data.error}</div>;
  if (!d || !g || !node) return <div className="note">Loading the hospital…</div>;

  const asset = d.assets.find((a) => a.id === node.assetId);
  const flexNow = flex.data?.assets.find((a) => a.id === node.assetId)?.flexKwNow;
  const lm = main.data?.live;
  const ladder = main.data?.ladder;
  const activeEvent = ev.data?.events.find((e) => e.status === 'running' || e.status === 'armed');
  const inEvent = activeEvent?.plan.actions.find((a) => a.assetId === node.assetId);
  const filtered = q
    ? nodes.filter((n) => `${n.title} ${n.id} ${n.floorId}`.toLowerCase().includes(q.toLowerCase()))
    : nodes;
  const floors = [...d.floors].sort((a, b) => b.level - a.level);

  const panel = (
    <aside className="st-panel st-glass" aria-label={`${node.title} details`} aria-live="polite">
      <div className="between">
        <span className="note">{d.floors.find((f) => f.id === node.floorId)?.name ?? node.floorId}</span>
        <ClassTag cls={node.drClass} />
      </div>
      <h3>{node.title}</h3>
      <div className="note">{asset?.action ?? (node.drClass === 'meter' ? 'Measures only; never commanded.' : '')}</div>
      {node.drClass === 'protected' || node.drClass === 'critical' ? (
        <div className="note">ergOS watches this and never changes it.</div>
      ) : null}
      <div className="st-fig">
        {node.points
          .filter((p) => !(node.id === 'ht-meter' && p.id.endsWith('md_kva_month')))
          .slice(0, 6)
          .map((p) => (
            <div key={p.id}>
              <b>
                {num(
                  v(p.id),
                  ['kW', 'kVA', 'kWh', 'kVAh', 'kvarh', 'L', 'ppm'].includes(p.unit) ? 0 : p.unit === 'pf' ? 2 : 1,
                )}
                <span> {p.unit}</span>
              </b>
              <span>{label(p.id)}</span>
            </div>
          ))}
        {node.id === 'ht-meter' && lm && ladder ? (
          <div style={{ gridColumn: 'span 2' }}>
            <b>
              {num(lm.monthMdKva)} <span>kVA</span>
            </b>
            <span>
              Month's peak · ceiling {num(ladder.ceiling)} · sanction {num(ladder.sanction)}
            </span>
          </div>
        ) : null}
        {node.assetId && (node.drClass === 'flexible' || node.drClass === 'conditional') ? (
          <div>
            <b>
              {num(flexNow)} <span>kW</span>
            </b>
            <span>Can be held back now</span>
          </div>
        ) : null}
        {node.assetId ? (
          <div>
            <b style={{ fontSize: 15 }}>{curtailed.has(node.assetId) ? 'Held by ergOS' : 'Normal'}</b>
            <span>State</span>
          </div>
        ) : null}
      </div>
      {(NODE_INTERLOCK[node.id] ?? []).map((id) => {
        const s = ctl.data?.control?.interlocks[id];
        return (
          <div key={id} className="note">
            Interlock {id}: <b>{s ? `${s.state} · ${s.value}` : 'no data'}</b>
          </div>
        );
      })}
      {inEvent && activeEvent ? (
        <div className="st-glass" style={{ padding: 10, borderRadius: 14 }}>
          <b>DR event {activeEvent.status}</b> · {istTime(activeEvent.start)}–{istTime(activeEvent.end)} · target{' '}
          {num(inEvent.expectKw)} kW for this load
        </div>
      ) : null}
      {chart ? (
        <StrataChart options={chart} minHeight={170} label={`${node.title} last 24 hours`} />
      ) : (
        <div className="note">No history for {mainPoint(node)} yet.</div>
      )}
      <div className="row">
        <button type="button" className="btn btn-glass" onClick={() => step(-1)} aria-label="Previous stop">
          ← Previous
        </button>
        <button type="button" className="btn btn-green" onClick={() => step(1)} aria-label="Next stop">
          Next stop →
        </button>
      </div>
      <div className="note">Driver later: {node.driverLater ?? '–'}</div>
    </aside>
  );

  const strip = (
    <div className="st-strip st-glass" role="status">
      <span>
        Site <b>{num(lm?.kva)}</b> kVA · projected <b>{num(lm?.projectedKva)}</b> of {num(ladder?.ceiling)}
      </span>
      <span>
        Solar <b>{num(lm?.solarKw)}</b> kW
      </span>
      <span>
        Hot water <b>{num(lm?.hwSocPct)}</b>%
      </span>
      <span>
        Cost today <b>{inr(lm?.todayCostInr)}</b>
      </span>
      {main.data?.simulated ? (
        <span
          className="pill"
          style={{ background: 'rgba(214,204,250,.85)', color: '#44297a', fontWeight: 700, minHeight: 28 }}
        >
          Simulated data
        </span>
      ) : null}
      {bench ? (
        <span className="note">
          bench {bench.n ? `${num(bench.sum / bench.n, 1)} ms avg · worst ${num(bench.worst, 1)}` : '…'}
        </span>
      ) : null}
    </div>
  );

  if (webgl === false)
    return (
      <div className="stack">
        <div className="note">This browser has no WebGL2, so here is the list of stops.</div>
        <div className="grid-2">
          <div className="glass pad stack">
            {nodes.map((n) => (
              <button
                key={n.id}
                type="button"
                className="btn btn-glass"
                onClick={() => select(n.id)}
                aria-current={n.id === node.id}
              >
                {n.title}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative', minHeight: 520 }}>{panel}</div>
        </div>
      </div>
    );

  return (
    <div className="st-wrap">
      <div className="st-canvas">
        {webgl ? (
          <Scene
            d={d}
            mode={mode}
            selected={node.id}
            onSelect={select}
            maxLevel={maxLevel}
            night={night}
            lite={lite}
            motion={motion}
            live={live}
            keys={keys}
            yaw={yaw}
            onWalk={onWalk}
            onDecline={() => setLite(true)}
            onFrame={bench ? onFrame : undefined}
          />
        ) : null}
      </div>
      <div className="st-top st-glass">
        <div className="seg" role="group" aria-label="Navigation mode">
          {(['tour', 'walk', 'dollhouse'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'tour' ? 'Tour' : m === 'walk' ? 'Walk' : 'Dollhouse'}
            </button>
          ))}
        </div>
        <button type="button" className="st-chip" onClick={() => select('ht-meter')}>
          Follow the power
        </button>
        <input
          type="search"
          placeholder="Search, e.g. chiller"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search stops"
          onKeyDown={(e) => e.key === 'Enter' && filtered[0] && select(filtered[0].id)}
        />
        <button type="button" className="st-chip" aria-pressed={night} onClick={() => setNight(!night)}>
          Night
        </button>
        <button type="button" className="st-chip" aria-pressed={lite} onClick={() => setLite(!lite)}>
          Lite
        </button>
      </div>
      <nav className="st-map st-glass" aria-label="Floors and stops">
        <h4>Floors</h4>
        {floors.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-current={mode === 'dollhouse' ? slice === f.level : levelOf(node) === f.level && node.floorId === f.id}
            onClick={() => {
              if (mode === 'dollhouse') setSlice(f.level);
              else {
                const first = nodes.find((n) => n.floorId === f.id);
                if (first) select(first.id);
              }
            }}
          >
            <span style={{ width: 26, fontWeight: 700 }}>{f.id.split(':').pop()}</span> {f.name}
          </button>
        ))}
        <h4>Stops {q ? `matching “${q}”` : ''}</h4>
        {filtered.map((n) => (
          <button key={n.id} type="button" aria-current={n.id === node.id} onClick={() => select(n.id)}>
            <span
              className="dot"
              style={{ background: n.assetId && curtailed.has(n.assetId) ? '#e0901c' : CLASS_COLOR[n.drClass] }}
            />
            {n.title}
          </button>
        ))}
      </nav>
      {mode === 'walk' ? (
        <>
          <div className="st-help st-glass">
            WASD or arrows to walk · Q/E to turn · stops open as you reach them · pick a floor to take the lift
          </div>
          <div className="st-pad" role="group" aria-label="Walk controls">
            {[
              ['', ''],
              ['↑', 'w'],
              ['', ''],
              ['↺', 'ArrowLeft'],
              ['↓', 's'],
              ['↻', 'ArrowRight'],
            ].map(([t, k], i) =>
              t ? (
                <button
                  key={k}
                  type="button"
                  aria-label={k}
                  onPointerDown={() => keys.current.add(k!)}
                  onPointerUp={() => keys.current.delete(k!)}
                  onPointerLeave={() => keys.current.delete(k!)}
                >
                  {t}
                </button>
              ) : (
                <span key={`s${i.toString()}`} />
              ),
            )}
          </div>
        </>
      ) : null}
      {panel}
      {strip}
    </div>
  );
}

function mainPoint(n: StreetNode): string {
  return (
    (
      n.points.find((p) => /\.kw$/.test(p.id)) ??
      n.points.find((p) => p.unit === 'kVA') ??
      n.points.find((p) => p.unit === '%') ??
      n.points[0]
    )?.id ?? `${n.id}.kw`
  );
}
function unitOf(n: StreetNode): string {
  return n.points.find((p) => p.id === mainPoint(n))?.unit ?? 'kW';
}
