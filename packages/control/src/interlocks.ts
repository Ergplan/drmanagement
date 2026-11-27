/**
 * Clinical interlocks (invariant 3). Limits and freshness come from reference/control.yaml (`interlocks`), passed
 * in as InterlockSpec[]. Any trip or stale required reading makes the gate unhealthy: the dispatcher then refuses
 * new commands and the runner aborts and restores. Pure code, no I/O (invariant 8).
 */
export interface PointValue {
  value: number;
  ts: Date;
}
export type Latest = (pointId: string) => PointValue | undefined;
export type InterlockState = 'healthy' | 'tripped' | 'stale';

export interface InterlockSpec {
  id: string;
  name: string;
  points: string[];
  min?: number;
  max?: number;
  fresh_s?: number;
  unit?: string;
}

export interface InterlockResult {
  healthy: boolean;
  states: Record<string, InterlockState>;
  values: Record<string, string>;
  /** first unhealthy interlock, for refusal messages */
  why: string;
}

const fmt = (v: number, unit?: string) => {
  if (unit === 'flag') return v >= 1 ? 'Normal' : 'Alarm';
  if (unit === '%') return `${v.toFixed(0)}%`;
  return `${v.toFixed(1)}${unit ? ` ${unit}` : ''}`;
};

export function evaluateInterlocks(
  specs: InterlockSpec[],
  latest: Latest,
  now: Date,
  engineerArmed = true,
): InterlockResult {
  const states: Record<string, InterlockState> = {};
  const values: Record<string, string> = {};
  for (const s of specs) {
    if (s.unit === 'armed') {
      states[s.id] = engineerArmed ? 'healthy' : 'tripped';
      values[s.id] = engineerArmed ? 'Armed' : 'Not armed';
      continue;
    }
    const pv = s.points.map((p) => latest(p));
    const ages = pv.map((x) => (x ? (now.getTime() - x.ts.getTime()) / 1000 : Number.POSITIVE_INFINITY));
    const fresh = s.fresh_s ?? 120;
    if (ages.some((a) => !(a <= fresh)) || pv.some((x) => !x || !Number.isFinite(x.value))) {
      states[s.id] = 'stale';
      values[s.id] = 'no fresh reading';
      continue;
    }
    const vals = pv.map((x) => x!.value);
    const ok = vals.every((v) => (s.min === undefined || v >= s.min) && (s.max === undefined || v <= s.max));
    states[s.id] = ok ? 'healthy' : 'tripped';
    values[s.id] =
      s.unit === 'age' ? `${Math.round(Math.max(...ages))} s` : vals.map((v) => fmt(v, s.unit)).join(' / ');
  }
  const bad = specs.find((s) => states[s.id] !== 'healthy');
  return { healthy: !bad, states, values, why: bad ? `${bad.name} ${states[bad.id]} (${values[bad.id]})` : '' };
}
