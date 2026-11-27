/**
 * Hospital load model for Globe Medicare. A physical-ish model, not a replay:
 * asset loads follow the Flexibility Registry's November profiles, reshaped by weather (cooling), hospital
 * operations (OPD days, imaging scans, meals) and the month's calibration; solar comes from a clear-sky model;
 * the hot-water store has its own state; actuation changes loads with response lags and rebound.
 */
import { IST_OFFSET_MIN } from '@drm/domain';
import { normalTempAt, weatherAt } from './climate';
import type { Reference } from './reference';
import { gauss, u01 } from './rng';
import { solarAt, sunElevation } from './solar';

export const ASSET_IDS = [
  'chiller',
  'ahu',
  'heatpump',
  'laundry',
  'pump',
  'ev',
  'clinicalhvac',
  'icu',
  'imaging',
  'medgas',
] as const;
export type AssetId = (typeof ASSET_IDS)[number];
export type Loads = Record<AssetId | 'base', number>;

export interface Calib {
  base: number; // scale on lighting, lifts, plugs and other non-asset load
  cool: number; // cooling rise per °C above the November reference (fitted once to the summer bill)
  eve?: number; // evening coincidence 17:30–22:00 (summer evenings: cooling sustain, visitors, lighting)
}

export interface Override {
  mode: 'shed' | 'run' | 'setpoint' | 'lock';
  since: number; // epoch ms
}

export interface SimState {
  soc: number; // hot-water store state of charge 0..1
  hpOn: boolean;
  overrides: Partial<Record<AssetId, Override>>;
  deferredKwh: Partial<Record<AssetId, number>>; // energy held back, paid back after restore
  rebound: Partial<Record<AssetId, { kw: number; untilMs: number }>>;
  lagged: Partial<Record<AssetId, number>>; // multiplier currently applied (first-order lag)
  lastMs: number;
}

export interface Snapshot {
  at: Date;
  month: number;
  istHour: number;
  dayNo: number;
  tempC: number;
  rhPct: number;
  ghiWm2: number;
  loads: Loads;
  loadKw: number;
  solarKw: number;
  gridKw: number;
  pf: number;
  gridKva: number;
  gridKvar: number;
  outage: boolean;
  soc: number;
  hpOn: boolean;
  scans: { ct: boolean; mri: boolean; cath: boolean };
  occupancyPct: number;
  opdOpen: boolean;
  mealService: boolean;
}

export interface ScenarioOptions {
  hotDelta?: number; // °C added to the day (heat wave)
  seed: number;
}

/** Holidays when OPD is closed (operations.yaml). */
const HOLIDAYS = new Set([
  '2026-01-26',
  '2026-03-04',
  '2026-08-15',
  '2026-10-02',
  '2026-10-20',
  '2026-11-08',
  '2026-12-25',
]);

export const HEATWAVE_PER_C = Number(process.env.SIM_HEATWAVE_PER_C ?? 0.06);
const STORE_KWH_TH = 697; // 12,000 L × 50 K
const HP_HEAT_KW = 102; // 2 × 51 kW thermal
const HP_ELEC_KW = 30;

/** Response time constant (minutes) from "5 min", "Immediate", "–". */
function tauMin(text: string | undefined): number {
  const m = /([\d.]+)\s*min/.exec(text ?? '');
  return m ? Math.max(0.5, Number(m[1]) / 3) : 0.5;
}

/** Hot-water draw as a share of daily heat (sums to ~1 over 24 h): bathing, meals, shift changes. */
function drawShare(h: number): number {
  const bumps = [
    [7, 1.6, 0.18],
    [12.75, 1.0, 0.1],
    [19.5, 1.2, 0.12],
    [8, 0.6, 0.06],
    [14, 0.6, 0.06],
    [20, 0.6, 0.06],
  ];
  let s = 0.017; // background
  for (const [c, w, a] of bumps) s += a! * Math.exp(-0.5 * ((h - c!) / w!) ** 2);
  return s / 1.04;
}

export class HospitalModel {
  readonly profiles: Record<AssetId, number[]>;
  readonly residual: number[]; // non-asset load (lighting, lifts, plugs, IT) by hour, November
  readonly tau: Record<AssetId, number>;
  private dayCache = new Map<
    number,
    {
      ct: Array<[number, number]>;
      mri: Array<[number, number]>;
      cath: Array<[number, number]>;
      outage: Array<[number, number]>;
    }
  >();

  constructor(
    readonly ref: Reference,
    readonly calib: (month: number, year: number) => Calib,
  ) {
    const byId = Object.fromEntries(ref.assets.map((a) => [a.id, a]));
    this.profiles = Object.fromEntries(ASSET_IDS.map((id) => [id, byId[id]!.hourly_profile_kw_nov])) as Record<
      AssetId,
      number[]
    >;
    this.tau = Object.fromEntries(ASSET_IDS.map((id) => [id, tauMin(byId[id]!.response_time)])) as Record<
      AssetId,
      number
    >;
    const g: number[] = ref.profiles.nov.y.g;
    const sol: number[] = ref.profiles.nov.y.s;
    this.residual = Array.from({ length: 24 }, (_, h) => {
      let load = 0;
      for (let q = 0; q < 4; q++) load += ((g[h * 4 + q] ?? 0) + (sol[h * 4 + q] ?? 0)) * 4;
      load /= 4;
      const assets = ASSET_IDS.reduce((s, id) => s + (this.profiles[id][h] ?? 0), 0);
      return Math.max(8, load - assets);
    });
  }

  static initialState(atMs: number): SimState {
    return { soc: 0.7, hpOn: false, overrides: {}, deferredKwh: {}, rebound: {}, lagged: {}, lastMs: atMs };
  }

  /** Interpolated hourly profile value at fractional hour. */
  private prof(arr: number[], h: number): number {
    const i = Math.floor(h) % 24;
    const f = h - Math.floor(h);
    return (arr[i] ?? 0) * (1 - f) + (arr[(i + 1) % 24] ?? 0) * f;
  }

  /** Day schedule of imaging scans and grid outages, seeded and cached. */
  private day(dayNo: number, seed: number, opdOpen: boolean) {
    let d = this.dayCache.get(dayNo);
    if (d) return d;
    const plan = (n: number, len: number, from: number, to: number, salt: number): Array<[number, number]> =>
      Array.from({ length: n }, (_, k) => {
        const start = from + u01(seed, salt, dayNo, k) * (to - from - len);
        return [start, start + len] as [number, number];
      });
    const ctN = Math.round((opdOpen ? 45 : 22) * (0.85 + 0.3 * u01(seed, 41, dayNo)));
    const mriN = Math.round((opdOpen ? 22 : 8) * (0.85 + 0.3 * u01(seed, 42, dayNo)));
    const cathN = opdOpen ? Math.round(5 * (0.6 + 0.8 * u01(seed, 43, dayNo))) : u01(seed, 44, dayNo) < 0.5 ? 1 : 0;
    const outN = u01(seed, 45, dayNo) < 1.5 / 30 ? 1 : 0;
    d = {
      ct: plan(ctN, 12 / 60, 7.5, 22, 51),
      mri: plan(mriN, 35 / 60, 7.5, 21.5, 52),
      cath: plan(cathN, 75 / 60, 8.5, 18.5, 53),
      outage: plan(outN, (6 + 6 * u01(seed, 46, dayNo)) / 60, 0, 24, 54),
    };
    if (this.dayCache.size > 64) this.dayCache.clear();
    this.dayCache.set(dayNo, d);
    return d;
  }

  /** Apply an actuation from the dispatcher. */
  actuate(state: SimState, asset: AssetId, action: string, atMs: number): string {
    if (action === 'restore') {
      const deferred = state.deferredKwh[asset] ?? 0;
      if (deferred > 0) state.rebound[asset] = { kw: deferred, untilMs: atMs + 60 * 60000 }; // pay back over 60 min
      state.deferredKwh[asset] = 0;
      delete state.overrides[asset];
      return 'restored';
    }
    const mode = (
      action === 'run' ? 'run' : action === 'setpoint' ? 'setpoint' : action === 'lock' ? 'lock' : 'shed'
    ) as Override['mode'];
    state.overrides[asset] = { mode, since: atMs };
    return mode;
  }

  /** Target multiplier on an asset's natural load for its override. */
  private overrideFactor(asset: AssetId, o: Override | undefined): number {
    if (!o) return 1;
    switch (asset) {
      case 'chiller':
        return o.mode === 'lock' ? 0.8 : o.mode === 'setpoint' ? 0.85 : 0.85;
      case 'ahu':
        return 0.6;
      case 'laundry':
        return 0.15;
      case 'pump':
        return 0.25;
      case 'ev':
        return 0.45;
      default:
        return 1;
    }
  }

  /**
   * Advance the state to `at` and return the hospital's instantaneous condition.
   * Call with increasing times; dt is taken from the previous call (max 15 min per step).
   */
  step(state: SimState, at: Date, opt: ScenarioOptions): Snapshot {
    const ms = at.getTime();
    const dtH = Math.min(0.25, Math.max(0, (ms - state.lastMs) / 3600000));
    state.lastMs = ms;
    const ist = new Date(ms + IST_OFFSET_MIN * 60000);
    const month = ist.getUTCMonth() + 1;
    const year = ist.getUTCFullYear();
    const h = ist.getUTCHours() + ist.getUTCMinutes() / 60 + ist.getUTCSeconds() / 3600;
    const dayNo = Math.floor((ms + IST_OFFSET_MIN * 60000) / 86400000);
    const dateStr = ist.toISOString().slice(0, 10);
    const dow = ist.getUTCDay();
    const opdOpen = dow !== 0 && !HOLIDAYS.has(dateStr);
    const c = this.calib(month, year);

    const w = weatherAt(month, h, dayNo, opt.seed, opt.hotDelta ?? 0);
    // Cooling relative to a normal November day at the same hour (the profiles' reference).
    // Building thermal lag: cooling follows the air temperature about 3 hours late.
    const lagH = (h - 3 + 24) % 24;
    const novT = normalTempAt(11, lagH);
    // Cooling demand: a fixed share plus a part proportional to degrees above an 18 °C balance point,
    // relative to the same hour of a normal November day (the profiles' reference).
    // Asymmetric: below November temperatures cooling falls fast (chillers stage down in winter, floor 30% for
    // clinical areas); above them it rises at the fitted rate (the bills show summer energy close to November's).
    const wLag = weatherAt(month, lagH, h < 3 ? dayNo - 1 : dayNo, opt.seed, opt.hotDelta ?? 0);
    const dT = wLag.tempC - novT;
    // A heat wave (scenario hotDelta) drives chillers harder than the monthly fit suggests: 6% per °C of anomaly.
    const heatWave = 1 + HEATWAVE_PER_C * Math.max(0, opt.hotDelta ?? 0);
    const coolRatio = (dT >= 0 ? 1 + c.cool * dT : Math.max(0.3, 1 + 0.07 * dT)) * heatWave;
    const occ = Math.min(
      0.98,
      (opdOpen ? 0.82 : 0.74) +
        0.02 * gauss(opt.seed, 61, dayNo) +
        (month >= 8 && month <= 10 ? 0.06 : 0) +
        (month === 12 || month === 1 ? 0.04 : 0),
    );
    const occF = occ / 0.8;
    const sched = this.day(dayNo, opt.seed, opdOpen);
    const inAny = (list: Array<[number, number]>) => list.some(([a, b]) => h >= a && h < b);
    const scans = { ct: inAny(sched.ct), mri: inAny(sched.mri), cath: inAny(sched.cath) };
    const outage = inAny(sched.outage);
    const opdDay = opdOpen ? 1 : 0.72;

    const natural: Record<AssetId, number> = {
      chiller: this.prof(this.profiles.chiller, h) * coolRatio,
      ahu: this.prof(this.profiles.ahu, h) * (h >= 8 && h < 18 ? opdDay : 1) * (1 + 0.35 * (coolRatio - 1)),
      heatpump: 0,
      laundry: this.prof(this.profiles.laundry, h) * (opdOpen ? 1 : 0.7),
      pump: this.prof(this.profiles.pump, h) * (0.9 + 0.1 * occF),
      ev: this.prof(this.profiles.ev, h) * (opdOpen ? 1 : 0.6),
      clinicalhvac: this.prof(this.profiles.clinicalhvac, h) * (1 + 0.2 * (coolRatio - 1)),
      icu: this.prof(this.profiles.icu, h) * (0.95 + 0.05 * occF),
      // average scan draw over a scan (peaks of 90/70/80 kVA last seconds, not minutes)
      imaging:
        0.5 * this.prof(this.profiles.imaging, h) * (opdOpen ? 1 : 0.5) +
        (scans.ct ? 15 : 0) +
        (scans.mri ? 18 : 0) +
        (scans.cath ? 25 : 0),
      medgas: this.prof(this.profiles.medgas, h) * (0.95 + 0.05 * occF),
    };

    // Hot-water store: draw, default BMS timer (10:00–15:00 top-up) plus low-store thermostat; overrides win.
    const dailyHeat =
      510 * (0.85 + 0.15 * occF) * (month <= 2 || month === 12 ? 1.25 : month >= 4 && month <= 9 ? 0.8 : 1);
    const drawKwhTh = dailyHeat * drawShare(h) * dtH;
    const hpO = state.overrides.heatpump;
    let hpOn: boolean;
    if (hpO?.mode === 'run') hpOn = state.soc < 0.97;
    else if (hpO?.mode === 'shed')
      hpOn = state.soc < 0.3; // safety: never let the store go cold
    else hpOn = (h >= 10 && h < 15 && state.soc < 0.95) || state.soc < 0.35 || (state.hpOn && state.soc < 0.6);
    state.hpOn = hpOn;
    state.soc = Math.min(1, Math.max(0, state.soc + ((hpOn ? HP_HEAT_KW * dtH : 0) - drawKwhTh) / STORE_KWH_TH));
    natural.heatpump = hpOn ? HP_ELEC_KW : 0.4;

    // Lighting is ~45% of base load and follows darkness, relative to the same hour in mid-November.
    const dark = (el: number) => Math.min(1, Math.max(0, (0.1 - el) / 0.2));
    const novSame = new Date(Date.UTC(ist.getUTCFullYear(), 10, 15) - IST_OFFSET_MIN * 60000 + h * 3600000);
    const light = 0.55 + (0.45 * (0.25 + 0.75 * dark(sunElevation(at)))) / (0.25 + 0.75 * dark(sunElevation(novSame)));
    const loads = {
      base:
        this.prof(this.residual, h) *
        c.base *
        light *
        (0.9 + 0.1 * occF) *
        (h >= 8 && h < 18 ? opdDay * 0.15 + 0.85 : 1),
    } as Loads;
    for (const id of ASSET_IDS) {
      const target = id === 'heatpump' ? 1 : this.overrideFactor(id, state.overrides[id]);
      const prev = state.lagged[id] ?? 1;
      const k = dtH > 0 ? 1 - Math.exp(-(dtH * 60) / this.tau[id]) : 1;
      const f = prev + (target - prev) * k;
      state.lagged[id] = f;
      let kw = natural[id] * f;
      if (f < 0.999 && dtH > 0)
        state.deferredKwh[id] =
          (state.deferredKwh[id] ?? 0) + natural[id] * (1 - f) * dtH * (id === 'laundry' || id === 'pump' ? 1 : 0.2);
      const rb = state.rebound[id];
      if (rb && ms < rb.untilMs)
        kw += rb.kw; // kWh over 1 h = kW
      else if (rb) delete state.rebound[id];
      if (id === 'chiller' && state.overrides.chiller?.mode === 'lock') kw = Math.min(kw, 140);
      loads[id] = Math.max(0, kw);
    }

    // Evening coincidence (fitted per month): smooth bump 17:30–22:00 on the non-clinical part of the load.
    const eve = c.eve ?? 1;
    if (eve !== 1) {
      const bump = Math.exp(-0.5 * ((h - 19.5) / 1.3) ** 2);
      const k = 1 + (eve - 1) * bump;
      for (const id of ['base', 'chiller', 'ahu', 'laundry', 'ev'] as const) loads[id] *= k;
    }
    const loadKw = Object.values(loads).reduce((a, b) => a + b, 0);
    const sol = solarAt(at, month, dayNo, opt.seed, w.tempC);
    const solarKw = outage ? 0 : Math.min(sol.kw, loadKw * 0.95); // zero export; inverters trip in an outage
    const gridKw = outage ? 0 : loadKw - solarKw;
    const pf = Math.min(
      0.985,
      Math.max(0.9, 0.94 + 0.006 * Math.sin(h / 3.8) + 0.004 * gauss(opt.seed, 71, Math.floor(ms / 300000))),
    );
    const gridKva = gridKw / pf;
    return {
      at,
      month,
      istHour: h,
      dayNo,
      tempC: w.tempC,
      rhPct: w.rhPct,
      ghiWm2: sol.ghiWm2,
      loads,
      loadKw,
      solarKw,
      gridKw,
      pf,
      gridKva,
      gridKvar: gridKw * Math.tan(Math.acos(pf)),
      outage,
      soc: state.soc,
      hpOn,
      scans,
      occupancyPct: occ * 100,
      opdOpen,
      mealService: (h >= 6.5 && h < 8) || (h >= 12 && h < 13.5) || (h >= 19 && h < 20.5),
    };
  }
}
