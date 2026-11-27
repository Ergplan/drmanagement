/**
 * DR planner (cloud side, deterministic). Picks non-clinical loads to meet a target over an event window and
 * predicts the peak with and without the plan. Clinical exclusion is enforced here too (invariant 1): protected,
 * critical and meter-only nodes are listed as excluded and never appear in actions.
 */
export interface FlexAsset {
  id: string;
  name: string;
  drClass: string;
  flexKw: number; // expected relief this season in the evening window
  maxDurationH: number | null;
  responseMin: number | null;
  rebound: string;
}

export interface PlanInput {
  /** 96 P50 block kVA for the event day (null where unknown) */
  forecastKva: Array<number | null>;
  startBlock: number; // 1..96, IST
  endBlock: number; // inclusive
  targetKw: number;
  assets: FlexAsset[];
  pf?: number;
  ceilingKva: number;
}

export interface PlanAction {
  assetId: string;
  action: 'shed' | 'setpoint';
  expectKw: number;
}

export interface Plan {
  actions: PlanAction[];
  precondition: { leadMin: number; actions: Array<{ assetId: string; action: 'run' }> } | null;
  expectedKw: number;
  /** expected kVA relief at the meter over the window */
  reliefKva: number;
  meetsTarget: boolean;
  needsMedicalSuperintendent: boolean;
  forecastPeakKva: number | null;
  plannedPeakKva: number | null;
  excluded: Array<{ id: string; why: string }>;
  skipped: Array<{ id: string; why: string }>;
}

export const HVAC_ASSETS = new Set(['chiller', 'ahu']);
const ALLOWED = new Set(['flexible', 'conditional']);

export function seasonalFlexKw(flex: { nov_evening: number; jun_evening: number }, month: number): number {
  // Cooling-driven relief: June value Apr–Sep, November value otherwise.
  return month >= 4 && month <= 9 ? flex.jun_evening : flex.nov_evening;
}

export function plan(i: PlanInput): Plan {
  const pf = i.pf ?? 0.98;
  const hours = ((i.endBlock - i.startBlock + 1) * 15) / 60;
  const excluded: Plan['excluded'] = [];
  const skipped: Plan['skipped'] = [];
  const pool: FlexAsset[] = [];
  for (const a of i.assets) {
    if (!ALLOWED.has(a.drClass)) excluded.push({ id: a.id, why: `${a.drClass}: never curtailed` });
    else if (a.flexKw <= 0) skipped.push({ id: a.id, why: 'no relief available this season' });
    else if (a.maxDurationH !== null && a.maxDurationH < hours)
      skipped.push({ id: a.id, why: `can hold ${a.maxDurationH} h, window is ${hours} h` });
    else pool.push(a);
  }
  // Flexible loads before conditional (no comfort effect), then the biggest relief first.
  pool.sort((a, b) => (a.drClass === b.drClass ? b.flexKw - a.flexKw : a.drClass === 'flexible' ? -1 : 1));
  const actions: PlanAction[] = [];
  let kw = 0;
  for (const a of pool) {
    if (kw >= i.targetKw) break;
    actions.push({ assetId: a.id, action: a.id === 'chiller' ? 'setpoint' : 'shed', expectKw: a.flexKw });
    kw += a.flexKw;
  }
  const win = i.forecastKva.slice(i.startBlock - 1, i.endBlock).filter((v): v is number => v !== null);
  const all = i.forecastKva.filter((v): v is number => v !== null);
  const forecastPeakKva = all.length ? Math.max(...all) : null;
  const outside = i.forecastKva.filter(
    (v, k): v is number => v !== null && (k < i.startBlock - 1 || k > i.endBlock - 1),
  );
  const plannedPeakKva = win.length ? Math.max(Math.max(...win) - kw / pf, ...(outside.length ? outside : [0])) : null;
  const hp = actions.some((a) => a.assetId === 'heatpump');
  return {
    actions,
    precondition: hp ? { leadMin: 60, actions: [{ assetId: 'heatpump', action: 'run' }] } : null,
    expectedKw: kw,
    reliefKva: kw / pf,
    meetsTarget: kw >= i.targetKw,
    needsMedicalSuperintendent: actions.some((a) => HVAC_ASSETS.has(a.assetId)),
    forecastPeakKva,
    plannedPeakKva,
    excluded,
    skipped,
  };
}
