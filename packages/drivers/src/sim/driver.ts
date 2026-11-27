/**
 * The simulator as a Driver: serves every point in reference/points.yaml from the hospital model.
 * Nothing outside packages/drivers/sim knows the data is simulated, except source = 'sim' (invariant 10).
 */
import type { ActuateCommand, ActuateResult, Driver, Reading } from '../types';
import { ASSET_IDS, type AssetId, HospitalModel, type SimState, type Snapshot } from './model';
import { loadReference, type Reference } from './reference';
import { gauss, u01 } from './rng';
import { calibFrom } from './run';

export interface SimDriverOptions {
  seed?: number;
  scenario?: 'normal' | 'hot_june_evening' | 'interlock_trip' | 'stale_meter' | 'outage';
  ref?: Reference;
}

export class SimDriver implements Driver {
  readonly id = 'sim';
  readonly model: HospitalModel;
  readonly ref: Reference;
  private state: SimState | null = null;
  private seed: number;
  private scenario: NonNullable<SimDriverOptions['scenario']>;
  private faults = new Map<string, { untilMs: number; value: number }>();
  private kvahImport = 18_250_000; // meter register at the start (kVAh)
  private kwhToday = new Map<string, number>();
  private lastDay = -1;
  private monthMd = 0;
  private lastMonth = -1;
  private blockKvah = 0;
  private blockStartMs = 0;
  last: Snapshot | null = null;

  constructor(opt: SimDriverOptions = {}) {
    this.ref = opt.ref ?? loadReference();
    this.model = new HospitalModel(this.ref, calibFrom(this.ref));
    this.seed = opt.seed ?? 42;
    this.scenario = opt.scenario ?? 'normal';
  }

  health(): 'ok' | 'degraded' | 'down' {
    return 'ok';
  }

  /** Force a point to a value for a while (tests and the dev fault API). */
  injectFault(pointId: string, value: number, durationS: number, now: Date) {
    this.faults.set(pointId, { untilMs: now.getTime() + durationS * 1000, value });
  }

  actuate(cmd: ActuateCommand, now: Date): ActuateResult {
    if (!this.state) this.state = HospitalModel.initialState(now.getTime());
    if (!(ASSET_IDS as readonly string[]).includes(cmd.assetId))
      return { ok: false, detail: `unknown asset ${cmd.assetId}` };
    const r = this.model.actuate(this.state, cmd.assetId as AssetId, cmd.action, now.getTime());
    return { ok: true, detail: r };
  }

  /** Current state of the hospital (advances the model to `now`). */
  snapshot(now: Date): Snapshot {
    if (!this.state) this.state = HospitalModel.initialState(now.getTime() - 60000);
    const ist = new Date(now.getTime() + 330 * 60000);
    const h = ist.getUTCHours() + ist.getUTCMinutes() / 60;
    const hotDelta = this.scenario === 'hot_june_evening' ? 4 : 0;
    const s = this.model.step(this.state, now, {
      seed: this.seed,
      hotDelta: hotDelta + (this.scenario === 'outage' && h >= 18 && h < 18.2 ? 0 : 0),
    });
    if (this.scenario === 'outage' && h >= 18 && h < 18.15) {
      s.outage = true;
      s.gridKw = 0;
      s.gridKva = 0;
      s.solarKw = 0;
    }
    this.last = s;
    return s;
  }

  read(now: Date): Reading[] {
    const prevMs = this.state?.lastMs ?? now.getTime() - 60000;
    const s = this.snapshot(now);
    const dtH = Math.max(0, (now.getTime() - prevMs) / 3600000);
    const ms = now.getTime();
    const minute = Math.floor(ms / 60000);
    const n = (salt: number, scale: number) => scale * gauss(this.seed, salt, minute);

    if (s.dayNo !== this.lastDay) {
      this.kwhToday.clear();
      this.lastDay = s.dayNo;
    }
    if (s.month !== this.lastMonth) {
      this.monthMd = 0;
      this.lastMonth = s.month;
    }
    const bs = Math.floor((ms + 330 * 60000) / 900000) * 900000 - 330 * 60000;
    if (bs !== this.blockStartMs) {
      if (this.blockStartMs) this.monthMd = Math.max(this.monthMd, this.blockKvah * 4);
      this.blockStartMs = bs;
      this.blockKvah = 0;
    }
    this.blockKvah += s.gridKva * dtH;
    this.kvahImport += s.gridKva * dtH;
    const acc = (k: string, kw: number) => {
      const v = (this.kwhToday.get(k) ?? 0) + kw * dtH;
      this.kwhToday.set(k, v);
      return v;
    };

    const L = s.loads;
    const chillerPlant = L.chiller;
    const tr = (chillerPlant * 0.78) / 0.78 / 0.95; // kW → TR at ~0.78 kW/TR incl. auxiliaries
    const chw = 6.8 + (this.model && this.state?.overrides.chiller?.mode === 'setpoint' ? 1.5 : 0);
    const stage3 = this.state?.overrides.chiller?.mode === 'lock';
    const hpOn = s.hpOn;
    const solarKwToday = acc('solar', s.solarKw);
    const tempLag = s.tempC;

    const v: Record<string, number> = {
      'ht-meter.kva': s.gridKva,
      'ht-meter.kw': s.gridKw,
      'ht-meter.kvar': s.gridKvar,
      'ht-meter.pf': s.pf,
      'ht-meter.v_ll': s.outage ? 0 : 11_050 + n(1, 60),
      'ht-meter.hz': s.outage ? 0 : 50 + n(2, 0.04),
      'ht-meter.kvah_import': this.kvahImport,
      'ht-meter.md_kva_month': Math.max(this.monthMd, this.blockKvah * 4),
      'transformers.kva_tx1': (s.loadKw / s.pf) * 0.55,
      'transformers.kva_tx2': (s.loadKw / s.pf) * 0.45,
      'transformers.oil_temp_tx1': 38 + s.loadKw * 0.04 + (tempLag - 25) * 0.4,
      'transformers.oil_temp_tx2': 36 + s.loadKw * 0.035 + (tempLag - 25) * 0.4,
      'lt-main.kw': s.loadKw,
      'lt-main.kva': s.loadKw / s.pf,
      'lt-main.pf': s.pf,
      'lt-main.thd_v': 2.6 + (s.scans.ct || s.scans.cath ? 0.8 : 0) + n(3, 0.1),
      'lt-main.thd_i': 6 + (s.scans.ct || s.scans.cath ? 6 : 0) + n(4, 0.4),
      'lt-main.apfc_steps': Math.round(6 + (s.pf - 0.94) * 100),
      'feeders.kw_per_feeder': s.loadKw / 12,
      'feeders.kwh_today_per_feeder': acc('feeders', s.loadKw) / 12,
      'chillers.kw': chillerPlant * 0.8,
      'chillers.tr': tr,
      'chillers.kw_per_tr': 0.78 + n(5, 0.01),
      'chillers.chw_supply_c': chw + n(6, 0.1),
      'chillers.chw_return_c': chw + 4.8 + n(7, 0.15),
      'chillers.cond_c': 29 + (tempLag - 25) * 0.6,
      'chillers.setpoint_c': chw,
      'chw-pumps.kw': chillerPlant * 0.2,
      'chw-pumps.running_count': chillerPlant > 120 && !stage3 ? 3 : 2,
      'ups.load_pct': 46 + n(8, 1.5),
      'ups.autonomy_min': 38 + n(9, 0.5),
      'ups.battery_state': 1,
      'dg.state': s.outage ? 1 : 0,
      'dg.fuel_l': 1650 - (s.outage ? 2 : 0),
      'dg.last_test': 3,
      'medgas.kw': L.medgas * 0.65,
      'medgas.line_pressure_ok': 1,
      'stp-ro.kw': L.pump,
      'stp-ro.overhead_tank_pct': 70 + 20 * Math.sin(s.istHour / 3.8),
      'stp-ro.running': L.pump > 5 ? 1 : 0,
      'laundry.kw': L.laundry * 0.6,
      'laundry.machines_running': Math.round((L.laundry * 0.6) / 7),
      'laundry.queue': this.state?.overrides.laundry ? Math.round((this.state.deferredKwh.laundry ?? 0) / 4) : 0,
      'emergency.kw': L.icu * 0.2,
      'opd-ahu.kw': L.ahu * 0.5,
      'opd-ahu.fan_pct': this.state?.overrides.ahu ? 70 : 82,
      'opd-ahu.co2_ppm': 520 + (s.opdOpen && s.istHour > 9 && s.istHour < 17 ? 260 : 40) + n(10, 15),
      'opd-ahu.zone_temp_c': 24 + (this.state?.overrides.ahu ? 0.6 : 0) + n(11, 0.2),
      'imaging.kva': L.imaging / 0.92,
      'imaging.mri_cold_head_kw': 9,
      'imaging.ct_state': s.scans.ct ? 1 : 0,
      'imaging.xray_state': u01(this.seed, 12, minute) < 0.1 ? 1 : 0,
      'kitchen.kw': L.laundry * 0.4,
      'kitchen.meal_service': s.mealService ? 1 : 0,
      'admin-lighting.kw': L.ev * 0.7,
      'admin-lighting.dim_pct': this.state?.overrides.ev ? 60 : 100,
      'ot.kw': L.clinicalhvac * 0.6,
      'ot.pressure_pa_ot1': 17 + n(13, 0.6),
      'ot.pressure_pa_ot2': 18 + n(14, 0.6),
      'ot.pressure_pa_ot3': 16.5 + n(15, 0.6),
      'ot.pressure_pa_ot4': 18.5 + n(16, 0.6),
      'ot.temp_c': 21.5 + n(17, 0.15),
      'ot.rh_pct': 52 + n(18, 1),
      'icu.kw': L.icu * 0.45,
      'icu.temp_c': 22.1 + n(19, 0.12),
      'icu.rh_pct': 54 + n(20, 1),
      'cathlab.kva': (s.scans.cath ? 25 : 4) / 0.92,
      'cathlab.case_running': s.scans.cath ? 1 : 0,
      'isolation.pressure_pa': -12 + n(21, 0.5),
      'isolation.exhaust_kw': 4.4,
      'ward.kw': L.base * 0.35 + L.ahu * 0.5,
      'ward.zone_temp_c': 24.5 + (this.state?.overrides.chiller ? 0.8 : 0) + n(22, 0.2),
      'ward.fcu_state': 1,
      'solar.kw': s.solarKw,
      'solar.kwh_today': solarKwToday,
      'solar.irradiance_wm2': s.ghiWm2,
      'solar.inverter_states': s.solarKw > 0.5 ? 3 : 0,
      'heatpumps.kw': L.heatpump,
      'heatpumps.cop': hpOn ? 3.4 + (tempLag - 25) * 0.03 : 0,
      'heatpumps.outlet_c': hpOn ? 65 : 0,
      'heatpumps.state': hpOn ? 1 : 0,
      'hw-tanks.soc_pct': s.soc * 100,
      'hw-tanks.top_c': 50 + s.soc * 15,
      'hw-tanks.bottom_c': 40 + s.soc * 20,
      'hw-tanks.outlet_c': 60 + s.soc * 5,
      'cooling-towers.fan_kw': chillerPlant * 0.05,
      'cooling-towers.cond_c': 29 + (tempLag - 25) * 0.6,
      'ev.kw': L.ev * 0.3,
      'ev.sessions': L.ev * 0.3 > 3 ? 1 : 0,
      'ev.state': this.state?.overrides.ev ? 0 : 1,
    };

    // Scenarios that exercise the interlocks and freshness checks.
    if (this.scenario === 'interlock_trip' && s.istHour >= 18 && s.istHour < 18.25) v['ot.pressure_pa_ot2'] = 11.5;

    const out: Reading[] = [];
    for (const node of this.ref.points) {
      for (const k of node.points) {
        const id = `${node.id}.${k}`;
        const f = this.faults.get(id);
        let value = f && f.untilMs > ms ? f.value : v[id];
        if (f && f.untilMs <= ms) this.faults.delete(id);
        if (value === undefined || Number.isNaN(value)) continue;
        if (this.scenario === 'stale_meter' && node.id === 'ht-meter' && s.istHour >= 18 && s.istHour < 18 + 2 / 60)
          continue;
        value = Math.round(value * 1000) / 1000;
        out.push({
          pointId: id,
          ts: now,
          value,
          source: 'sim',
          quality: s.outage && node.id === 'ht-meter' ? 'estimated' : 'good',
        });
      }
    }
    return out;
  }
}
