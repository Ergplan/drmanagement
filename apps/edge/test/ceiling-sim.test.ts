/**
 * End-to-end at the edge, no cloud: the real simulator on a hot June evening, the real collector and the real
 * control loop at 10 s steps. With the ceiling armed no 15-minute block may exceed 570 kVA (invariant 4); an OT
 * pressure trip must restore everything within one tick (invariant 3).
 */
import type { BlockRow, EdgeEvent } from '@drm/contracts';
import { SimDriver } from '@drm/drivers/sim';
import { describe, expect, it } from 'vitest';
import { Collector } from '../src/collector';
import { EdgeControl } from '../src/control';

function runEvening(opt: {
  armed: boolean;
  scenario: 'hot_june_evening' | 'interlock_trip';
  date: string;
  from: string;
  to: string;
}) {
  const sim = new SimDriver({ seed: 7, scenario: opt.scenario });
  const blocks: BlockRow[] = [];
  const events: EdgeEvent[] = [];
  const col = new Collector({ readings: () => {}, block: (b) => blocks.push(b), day: () => {} });
  const ctl = new EdgeControl(
    () => sim,
    (e) => events.push(e),
  );
  ctl.ceiling.armed = opt.armed;
  const t0 = Date.parse(`${opt.date}T${opt.from}:00+05:30`);
  const t1 = Date.parse(`${opt.date}T${opt.to}:00+05:30`);
  const trace: Array<{ t: number; active: number; healthy: boolean }> = [];
  for (let t = t0; t <= t1; t += 10_000) {
    const now = new Date(t);
    const r = sim.read(now);
    col.tick(now, r);
    ctl.step(now, r, col.live(now)?.projectedKva);
    trace.push({ t, active: ctl.dispatcher.active.size, healthy: ctl.state(now)?.gateHealthy ?? false });
  }
  return { blocks, events, trace };
}

describe('edge control on the simulator', () => {
  it('hot June evening: the ceiling keeps every block under 570 kVA', () => {
    const off = runEvening({
      armed: false,
      scenario: 'hot_june_evening',
      date: '2026-06-12',
      from: '16:00',
      to: '22:00',
    });
    const on = runEvening({
      armed: true,
      scenario: 'hot_june_evening',
      date: '2026-06-12',
      from: '16:00',
      to: '22:00',
    });
    const peak = (b: BlockRow[]) => Math.max(...b.slice(1).map((x) => x.avgKva));
    const before = peak(off.blocks);
    const after = peak(on.blocks);
    console.log(
      `hot June evening peak: ${before.toFixed(0)} kVA uncontrolled, ${after.toFixed(0)} kVA with the ceiling`,
    );
    expect(before).toBeGreaterThan(570);
    expect(after).toBeLessThan(570);
    const sheds = on.events.filter((e) => e.kind === 'command' && e.result === 'ok' && e.action !== 'restore');
    expect(sheds.length).toBeGreaterThan(0);
    for (const e of on.events)
      if (e.kind === 'command') expect(['icu', 'imaging', 'medgas', 'clinicalhvac']).not.toContain(e.assetId);
  });

  it('OT pressure trip during curtailment restores every load within one tick', () => {
    const r = runEvening({ armed: true, scenario: 'interlock_trip', date: '2026-06-12', from: '17:30', to: '18:30' });
    const tripAt = r.trace.find((x) => !x.healthy);
    expect(tripAt).toBeDefined();
    const before = r.trace.filter((x) => x.t < tripAt!.t).at(-1);
    expect(before?.active).toBeGreaterThan(0); // the evening heat-pump lock-out was in force
    const after = r.trace.filter((x) => x.t >= tripAt!.t);
    expect(after[0]!.active).toBe(0);
    // No new command succeeds while tripped.
    const tripped = r.trace.filter((x) => !x.healthy).map((x) => x.t);
    const okDuringTrip = r.events.filter(
      (e) =>
        e.kind === 'command' && e.result === 'ok' && e.action !== 'restore' && tripped.includes(Date.parse(e.sentAt)),
    );
    expect(okDuringTrip).toEqual([]);
    expect(
      r.events.some((e) => e.kind === 'interlock' && e.interlockId === 'ot-pressure' && e.state === 'tripped'),
    ).toBe(true);
  });
});
