import { describe, expect, it } from 'vitest';
import { Ceiling, ceilingFromYaml } from '../src/ceiling';
import { Dispatcher } from '../src/dispatcher';
import { DrExecutor, type DrIntent, validateIntent } from '../src/dr-executor';
import { heatPumpMode, heatPumpPolicyFromYaml } from '../src/heatpump';
import { evaluateInterlocks, type PointValue } from '../src/interlocks';
import { classes, controlYaml, interlockSpecs, rig } from './helpers';

const NOW = new Date('2026-11-27T12:30:00Z'); // 18:00 IST
const healthyPoints: Record<string, number> = {
  'ot.pressure_pa_ot1': 17,
  'ot.pressure_pa_ot2': 18,
  'ot.pressure_pa_ot3': 16.5,
  'ot.pressure_pa_ot4': 17.2,
  'icu.temp_c': 22.1,
  'isolation.pressure_pa': -12,
  'ot.rh_pct': 54,
  'icu.rh_pct': 52,
  'hw-tanks.outlet_c': 64,
  'medgas.line_pressure_ok': 1,
  'ot.temp_c': 21,
  'ht-meter.kva': 480,
};
const latestFrom =
  (vals: Record<string, number>, ageS = 5) =>
  (id: string): PointValue | undefined =>
    id in vals ? { value: vals[id]!, ts: new Date(NOW.getTime() - ageS * 1000) } : undefined;

describe('interlocks (invariant 3)', () => {
  it('all healthy on normal readings', () => {
    const r = evaluateInterlocks(interlockSpecs, latestFrom(healthyPoints), NOW);
    expect(r.healthy).toBe(true);
    expect(Object.keys(r.states)).toHaveLength(9);
  });
  it('OT 2 at 11.5 Pa trips ot-pressure', () => {
    const r = evaluateInterlocks(interlockSpecs, latestFrom({ ...healthyPoints, 'ot.pressure_pa_ot2': 11.5 }), NOW);
    expect(r.healthy).toBe(false);
    expect(r.states['ot-pressure']).toBe('tripped');
    expect(r.why).toContain('OT 1 to 4 pressure');
  });
  it('isolation room losing negative pressure trips', () => {
    expect(
      evaluateInterlocks(interlockSpecs, latestFrom({ ...healthyPoints, 'isolation.pressure_pa': -6 }), NOW).states[
        'isolation-pressure'
      ],
    ).toBe('tripped');
  });
  it('a main meter reading 20 s old is stale and blocks', () => {
    const latest = (id: string) =>
      id === 'ht-meter.kva' ? { value: 480, ts: new Date(NOW.getTime() - 20000) } : latestFrom(healthyPoints)(id);
    const r = evaluateInterlocks(interlockSpecs, latest, NOW);
    expect(r.states['meter-fresh']).toBe('stale');
    expect(r.healthy).toBe(false);
  });
  it('a missing point is stale, never assumed healthy', () => {
    const { 'icu.temp_c': _, ...rest } = healthyPoints;
    expect(evaluateInterlocks(interlockSpecs, latestFrom(rest), NOW).states['icu-temp']).toBe('stale');
  });
  it('engineer not armed trips', () => {
    expect(evaluateInterlocks(interlockSpecs, latestFrom(healthyPoints), NOW, false).healthy).toBe(false);
  });
});

describe('dispatcher (invariants 1, 2, 3)', () => {
  it('refuses every protected, critical and meter target without calling the driver', () => {
    const { d, calls } = rig();
    const excluded = Object.entries(classes()).filter(
      ([, c]) => c === 'protected' || c === 'critical' || c === 'meter',
    );
    expect(excluded.length).toBeGreaterThanOrEqual(5);
    for (const [id] of excluded)
      for (const action of ['shed', 'setpoint', 'lock', 'run', 'restore']) {
        const r = d.send({ assetId: id, action, reason: 'manual' }, NOW);
        expect(r.result).toBe('refused');
        expect(r.detail).toContain('clinical exclusion');
      }
    expect(d.send({ assetId: 'not-an-asset', action: 'shed', reason: 'manual' }, NOW).result).toBe('refused');
    expect(calls).toHaveLength(0);
  });
  it('allows flexible and conditional assets', () => {
    const { d, calls } = rig();
    expect(d.send({ assetId: 'laundry', action: 'shed', reason: 'manual' }, NOW).result).toBe('ok');
    expect(d.send({ assetId: 'chiller', action: 'setpoint', reason: 'manual' }, NOW).result).toBe('ok');
    expect(calls).toHaveLength(2);
  });
  it('refuses new commands while the gate is unhealthy, but still restores', () => {
    let healthy = true;
    const { d, calls } = rig({ healthy: () => healthy });
    d.send({ assetId: 'laundry', action: 'shed', reason: 'dr' }, NOW);
    healthy = false;
    expect(d.send({ assetId: 'pump', action: 'shed', reason: 'dr' }, NOW).detail).toContain('interlock gate');
    expect(d.send({ assetId: 'laundry', action: 'restore', reason: 'restore' }, NOW).result).toBe('ok');
    expect(calls.map((c) => c.action)).toEqual(['shed', 'restore']);
  });
  it('abortAndRestoreAll restores every active asset even above the trigger', () => {
    const { d } = rig({ projected: () => 560 });
    for (const a of ['laundry', 'pump', 'ev']) d.send({ assetId: a, action: 'shed', reason: 'ceiling' }, NOW);
    const r = d.abortAndRestoreAll(NOW, 'trip');
    expect(r.map((x) => x.result)).toEqual(['ok', 'ok', 'ok']);
    expect(d.active.size).toBe(0);
  });
  it('a DR command cannot change or release an asset the ceiling holds', () => {
    const { d } = rig();
    d.send({ assetId: 'heatpump', action: 'shed', reason: 'ceiling' }, NOW);
    expect(d.send({ assetId: 'heatpump', action: 'run', reason: 'schedule' }, NOW).detail).toBe(
      'asset held by the demand ceiling',
    );
    expect(d.send({ assetId: 'heatpump', action: 'restore', reason: 'restore', intentId: 'i1' }, NOW).detail).toBe(
      'asset held by the demand ceiling',
    );
  });
  it('does not add load back while projected demand is at or above Stage 1', () => {
    const { d } = rig({ projected: () => 530 });
    d.send({ assetId: 'laundry', action: 'shed', reason: 'dr' }, NOW);
    expect(d.send({ assetId: 'laundry', action: 'restore', reason: 'restore', intentId: 'i1' }, NOW).result).toBe(
      'refused',
    );
    expect(d.send({ assetId: 'heatpump', action: 'run', reason: 'schedule' }, NOW).result).toBe('refused');
  });
  it('records every command, refused ones included', () => {
    const { d, records } = rig();
    d.send({ assetId: 'icu', action: 'shed', reason: 'manual' }, NOW);
    d.send({ assetId: 'ev', action: 'shed', reason: 'manual' }, NOW);
    expect(records.map((r) => r.result)).toEqual(['refused', 'ok']);
  });
  it('a throwing driver is recorded as failed and nothing is marked active', () => {
    const recs: unknown[] = [];
    const d = new Dispatcher(
      classes(),
      {
        actuate: () => {
          throw new Error('modbus timeout');
        },
      },
      (r) => recs.push(r),
      () => ({ healthy: true, why: '' }),
    );
    expect(d.send({ assetId: 'pump', action: 'shed', reason: 'manual' }, NOW).result).toBe('failed');
    expect(d.active.size).toBe(0);
  });
});

describe('demand ceiling (invariant 4)', () => {
  const cfg = ceilingFromYaml(controlYaml.ceiling);
  it('loads the ladder from control.yaml', () => {
    expect(cfg.ceilingKva).toBe(570);
    expect(cfg.stages.map((s) => s.triggerKva)).toEqual([520, 545, 565]);
    for (const s of cfg.stages) for (const a of s.actions) expect(Dispatcher.allowed(classes()[a.assetId])).toBe(true);
  });
  it('steps up through the stages and sheds the right loads', () => {
    const { d, calls } = rig();
    const ev: string[] = [];
    const c = new Ceiling(cfg, d, (e) => ev.push(`${e.action}:${e.stage}:${e.assetId}`));
    c.step(NOW, 500, true);
    expect(calls).toHaveLength(0);
    c.step(NOW, 525, true);
    expect(c.stage).toBe(1);
    expect(calls.map((x) => x.assetId)).toEqual(['heatpump', 'laundry', 'pump', 'ev']);
    c.step(NOW, 566, true);
    expect(c.stage).toBe(3);
    expect(calls.slice(4)).toEqual([
      { assetId: 'chiller', action: 'setpoint' },
      { assetId: 'ahu', action: 'shed' },
      { assetId: 'chiller', action: 'lock' },
    ]);
    expect(ev).toContain('page:3:null');
  });
  it('restores one load at a time, 10 minutes apart, only below Stage 1', () => {
    const { d, calls } = rig({ projected: () => 470 });
    const c = new Ceiling(cfg, d, () => {});
    c.step(NOW, 530, true);
    const at = (min: number) => new Date(NOW.getTime() + min * 60000);
    c.step(at(5), 470, true);
    expect(calls.filter((x) => x.action === 'restore')).toHaveLength(0);
    c.step(at(10), 525, true);
    expect(calls.filter((x) => x.action === 'restore')).toHaveLength(0);
    // 505 + the load's expected 22.5 kW would cross Stage 1: wait
    c.step(at(11), 505, true);
    expect(calls.filter((x) => x.action === 'restore')).toHaveLength(0);
    c.step(at(12), 470, true);
    expect(calls.filter((x) => x.action === 'restore').map((x) => x.assetId)).toEqual(['ev']);
    for (let m = 22; m <= 52; m += 10) c.step(at(m), 470, true);
    expect(calls.filter((x) => x.action === 'restore').map((x) => x.assetId)).toEqual([
      'ev',
      'pump',
      'laundry',
      'heatpump',
    ]);
    expect(c.stage).toBe(0);
  });
  it('sheds nothing while the gate is unhealthy', () => {
    const { d, calls } = rig({ healthy: () => false });
    new Ceiling(cfg, d, () => {}).step(NOW, 560, false);
    expect(calls).toHaveLength(0);
  });
  it('a simulated hot evening never projects above 570 kVA with the ceiling acting', () => {
    // Toy plant: natural demand ramps 480→600 kVA; each shed asset removes its share.
    const relief: Record<string, number> = { heatpump: 35, laundry: 25, pump: 15, ev: 15, chiller: 45, ahu: 30 };
    const { d } = rig();
    const c = new Ceiling(cfg, d, () => {});
    let worst = 0;
    for (let i = 0; i < 360; i++) {
      const natural = 480 + Math.min(120, i * 0.8);
      const shed = [...d.active.keys()].reduce((s, a) => s + (relief[a] ?? 0), 0);
      const projected = natural - shed;
      worst = Math.max(worst, projected);
      c.step(new Date(NOW.getTime() + i * 10000), projected, true);
    }
    expect(worst).toBeLessThan(570);
  });
});

describe('heat-pump scheduler', () => {
  const p = heatPumpPolicyFromYaml(controlYaml.heat_pumps);
  it('soaks solar 10:00–15:00, locks out 17:30–22:00', () => {
    expect(heatPumpMode(p, 11 * 60, 70).mode).toBe('run');
    expect(heatPumpMode(p, 11 * 60, 97).mode).toBe('auto');
    expect(heatPumpMode(p, 18 * 60, 40).mode).toBe('shed');
    expect(heatPumpMode(p, 22 * 60, 40).mode).toBe('auto');
    expect(heatPumpMode(p, 7 * 60, 50).why).toContain('top-up');
  });
});

describe('DR executor', () => {
  const intent = (over: Partial<DrIntent> = {}): DrIntent => ({
    id: 'i1',
    startsAt: '2026-11-27T12:00:00Z', // 17:30 IST
    endsAt: '2026-11-27T14:30:00Z', // 20:00 IST
    targetKw: 60,
    actions: [
      { assetId: 'laundry', action: 'shed' },
      { assetId: 'pump', action: 'shed' },
      { assetId: 'ev', action: 'shed' },
    ],
    precondition: { leadMin: 60, actions: [{ assetId: 'heatpump', action: 'run' }] },
    approvals: {
      facilityManager: true,
      medicalSuperintendent: null,
      armedBy: 'duty.engineer',
      armedAt: '2026-11-27T11:00:00Z',
    },
    armBy: '17:00',
    ...over,
  });
  const at = (iso: string) => new Date(iso);

  it('validation refuses excluded assets, missing approvals and late arming', () => {
    const cls = classes();
    expect(validateIntent(intent(), cls, at('2026-11-27T10:00:00Z'))).toEqual([]);
    expect(
      validateIntent(intent({ actions: [{ assetId: 'icu', action: 'shed' }] }), cls, at('2026-11-27T10:00:00Z')).join(),
    ).toContain('clinical exclusion');
    expect(
      validateIntent(
        intent({ actions: [{ assetId: 'chiller', action: 'setpoint' }] }),
        cls,
        at('2026-11-27T10:00:00Z'),
      ).join(),
    ).toContain('medical superintendent');
    expect(
      validateIntent(
        intent({
          approvals: {
            facilityManager: true,
            medicalSuperintendent: null,
            armedBy: 'x',
            armedAt: '2026-11-27T11:45:00Z',
          },
        }),
        cls,
        at('2026-11-27T10:00:00Z'),
      ).join(),
    ).toContain('armed after 17:00');
    expect(
      validateIntent(
        intent({ approvals: { facilityManager: false, medicalSuperintendent: null, armedBy: null, armedAt: null } }),
        cls,
        at('2026-11-27T10:00:00Z'),
      ),
    ).toHaveLength(2);
  });
  it('runs precondition, event, staggered restore and recovery', () => {
    const { d, calls } = rig();
    const logs: string[] = [];
    const x = new DrExecutor(intent(), classes(), d, (l) => logs.push(l.phase));
    x.step(at('2026-11-27T11:10:00Z'), true);
    expect(x.phase).toBe('precondition');
    x.step(at('2026-11-27T12:00:00Z'), true);
    expect(x.phase).toBe('event');
    expect(calls.map((c) => c.assetId)).toEqual(['heatpump', 'laundry', 'pump', 'ev']);
    x.step(at('2026-11-27T14:30:00Z'), true);
    expect(x.phase).toBe('restore');
    for (let m = 0; m <= 40; m += 10) x.step(new Date(Date.parse('2026-11-27T14:30:00Z') + m * 60000), true);
    expect(calls.filter((c) => c.action === 'restore').map((c) => c.assetId)).toEqual([
      'ev',
      'pump',
      'laundry',
      'heatpump',
    ]);
    expect(x.phase).toBe('recovery');
    x.step(at('2026-11-27T15:45:00Z'), true);
    expect(logs.at(-1)).toBe('done');
  });
  it('an interlock trip during the event restores everything at once', () => {
    const { d, calls } = rig({ projected: () => 560 });
    const x = new DrExecutor(intent({ precondition: undefined }), classes(), d, () => {});
    x.step(at('2026-11-27T12:00:00Z'), true);
    x.step(at('2026-11-27T12:30:00Z'), false, 'OT 2 pressure');
    expect(x.phase).toBe('aborted');
    expect(calls.filter((c) => c.action === 'restore')).toHaveLength(3);
  });
  it('an intent that names a critical asset is rejected at the edge before anything is sent', () => {
    const { d, calls } = rig();
    const x = new DrExecutor(intent({ actions: [{ assetId: 'medgas', action: 'shed' }] }), classes(), d, () => {});
    x.step(at('2026-11-27T12:00:00Z'), true);
    expect(x.phase).toBe('rejected');
    expect(calls).toHaveLength(0);
  });
});
