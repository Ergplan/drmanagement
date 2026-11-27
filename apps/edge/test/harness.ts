import type { BlockRow, EdgeEvent, EdgeIntent } from '@drm/contracts';
import { SimDriver } from '@drm/drivers/sim';
import { Collector } from '../src/collector';
import { EdgeControl } from '../src/control';

type Scenario = 'normal' | 'hot_june_evening' | 'interlock_trip' | 'stale_meter' | 'outage';

/** Runs the real simulator, collector and edge control loop at 10 s steps, with optional intents and actions. */
export function run(o: {
  scenario: Scenario;
  date: string;
  from: string;
  to: string;
  intents?: Array<{ at: string; intent: EdgeIntent }>;
  restartAt?: string;
  burst?: { from: string; to: string; kw: number };
}) {
  const sim = new SimDriver({ seed: 11, scenario: o.scenario });
  const blocks: BlockRow[] = [];
  const events: EdgeEvent[] = [];
  const col = new Collector({ readings: () => {}, block: (b) => blocks.push(b), day: () => {} });
  let ctl = new EdgeControl(
    () => sim,
    (e) => events.push(e),
  );
  const t = (hm: string) => Date.parse(`${o.date}T${hm}:00+05:30`);
  const pending = [...(o.intents ?? [])].map((x) => ({ at: t(x.at), intent: x.intent, done: false }));
  const trace: Array<{ t: number; active: number; healthy: boolean; projected: number | undefined; phases: string[] }> =
    [];
  let restarted = false;
  for (let ms = t(o.from); ms <= t(o.to); ms += 10_000) {
    const now = new Date(ms);
    if (o.restartAt && !restarted && ms >= t(o.restartAt)) {
      // Edge process restarts: control state is lost; it restores everything, then pulls its intents again.
      restarted = true;
      ctl = new EdgeControl(
        () => sim,
        (e) => events.push(e),
      );
      ctl.safeStart(now);
      ctl.accept(
        pending
          .filter((p) => p.done)
          .map((p) => p.intent)
          .filter((i) => i.kind === 'dr'),
        now,
      );
    }
    for (const p of pending)
      if (!p.done && ms >= p.at) {
        ctl.accept([p.intent], now);
        p.done = true;
      }
    let r = sim.read(now);
    if (o.burst && ms >= t(o.burst.from) && ms < t(o.burst.to))
      r = r.map((x) =>
        x.pointId === 'ht-meter.kva' || x.pointId === 'ht-meter.kw' ? { ...x, value: x.value + o.burst!.kw } : x,
      );
    col.tick(now, r);
    ctl.step(now, r, col.live(now)?.projectedKva);
    const st = ctl.state(now);
    trace.push({
      t: ms,
      active: ctl.dispatcher.active.size,
      healthy: st?.gateHealthy ?? false,
      projected: col.live(now)?.projectedKva,
      phases: st?.intents.map((i) => i.phase) ?? [],
    });
  }
  return { blocks, events, trace, t, ctl };
}

export function intent(o: {
  id: string;
  date: string;
  from: string;
  to: string;
  assets?: string[];
  armedAt?: string;
}): EdgeIntent {
  return {
    id: o.id,
    eventId: `ev-${o.id}`,
    kind: 'dr',
    startsAt: new Date(`${o.date}T${o.from}:00+05:30`).toISOString(),
    endsAt: new Date(`${o.date}T${o.to}:00+05:30`).toISOString(),
    targetKw: 48,
    actions: (o.assets ?? ['laundry', 'pump', 'ev']).map((assetId) => ({ assetId, action: 'shed' as const })),
    approvals: {
      facilityManager: true,
      medicalSuperintendent: null,
      armedBy: 'de',
      armedAt: new Date(`${o.date}T${o.armedAt ?? '16:00'}:00+05:30`).toISOString(),
    },
    armBy: '17:00',
  };
}

export const abortIntent = (eventId: string, date: string): EdgeIntent => ({
  id: `ab-${eventId}`,
  eventId,
  kind: 'abort',
  startsAt: new Date(`${date}T17:30:00+05:30`).toISOString(),
  endsAt: new Date(`${date}T20:00:00+05:30`).toISOString(),
  targetKw: 0,
  actions: [],
  approvals: { facilityManager: true, medicalSuperintendent: null, armedBy: 'de', armedAt: null },
  armBy: '17:00',
});
