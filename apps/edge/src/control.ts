/**
 * Edge control loop (invariants 2–4). Runs every tick beside the collector, needs no cloud:
 *   interlocks → gate; trip → abort and restore everything; ceiling → shed/restore by projected block kVA;
 *   heat-pump scheduler; DR executors for intents pulled from the cloud.
 * Every actuation goes through the one Dispatcher, which calls the driver.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EdgeEvent, EdgeIntent, IntentAck, LiveSnapshot } from '@drm/contracts';
import {
  Ceiling,
  type CommandRecord,
  ceilingFromYaml,
  Dispatcher,
  type DrClass,
  DrExecutor,
  evaluateInterlocks,
  type HeatPumpMode,
  heatPumpMode,
  heatPumpPolicyFromYaml,
  type InterlockResult,
  type InterlockSpec,
  type PointValue,
} from '@drm/control';
import type { Driver, Reading } from '@drm/drivers';
import { parse } from 'yaml';

const REF = process.env.REFERENCE_DIR ?? new URL('../../../reference/', import.meta.url).pathname;
const y = (f: string) => parse(readFileSync(join(REF, f), 'utf8'));
const IST_MS = 330 * 60000;

export function loadClasses(): Record<string, DrClass> {
  const out: Record<string, DrClass> = {};
  for (const a of y('assets.yaml').assets as Array<{ id: string; dr_class: DrClass }>) out[a.id] = a.dr_class;
  for (const n of y('points.yaml').nodes as Array<{ id: string; dr_class: DrClass }>)
    if (n.dr_class === 'meter') out[n.id] = 'meter';
  return out;
}

export class EdgeControl {
  readonly classes = loadClasses();
  private readonly control = y('control.yaml');
  readonly specs = this.control.interlocks as InterlockSpec[];
  readonly latest = new Map<string, PointValue>();
  readonly dispatcher: Dispatcher;
  readonly ceiling: Ceiling;
  private readonly hpPolicy = heatPumpPolicyFromYaml(this.control.heat_pumps);
  private hp: { mode: HeatPumpMode; why: string } = { mode: 'auto', why: 'starting' };
  private il: InterlockResult = { healthy: false, states: {}, values: {}, why: 'starting' };
  private projected = 0;
  readonly executors = new Map<string, DrExecutor>();
  private readonly acks: IntentAck[] = [];
  cloudOk = false;

  constructor(
    actuatorFor: () => Driver | undefined,
    private readonly emit: (e: EdgeEvent) => void,
    private readonly engineerArmed = () => process.env.ENGINEER_ARMED !== 'false',
  ) {
    const cfg = ceilingFromYaml(this.control.ceiling);
    this.dispatcher = new Dispatcher(
      this.classes,
      {
        actuate: (c, now) => {
          const d = actuatorFor();
          if (!d) return { ok: false, detail: 'no driver for asset' };
          return d.actuate(c, now);
        },
      },
      (c: CommandRecord) => this.emit({ ...c, params: c.params as Record<string, unknown> }),
      () => ({ healthy: this.il.healthy, why: this.il.why }),
      () => ({ projectedKva: this.projected, restoreBelowKva: cfg.restoreBelowKva }),
    );
    this.ceiling = new Ceiling(cfg, this.dispatcher, (e) => this.emit(e));
  }

  /**
   * On start the edge does not know what an earlier run left curtailed (a real device keeps its last command).
   * Put every commandable load back to normal, so nothing stays held without an owner.
   */
  safeStart(now: Date) {
    for (const [assetId, cls] of Object.entries(this.classes))
      if (Dispatcher.allowed(cls))
        this.dispatcher.send(
          { assetId, action: 'restore', reason: 'restore', params: { why: 'edge start' }, force: true },
          now,
        );
    this.dispatcher.active.clear();
  }

  /** One control step. readings: this tick's driver readings; projectedKva from the collector. */
  step(now: Date, readings: Reading[], projectedKva: number | undefined) {
    for (const r of readings) if (r.quality !== 'bad') this.latest.set(r.pointId, { value: r.value, ts: r.ts });
    // No meter reading → projection unknown: treat as at the ceiling so nothing is added back.
    this.projected = projectedKva ?? this.ceiling.cfg.ceilingKva;

    const prev = this.il;
    this.il = evaluateInterlocks(this.specs, (id) => this.latest.get(id), now, this.engineerArmed());
    for (const id of Object.keys(this.il.states))
      if (prev.states[id] !== this.il.states[id])
        this.emit({
          kind: 'interlock',
          interlockId: id,
          at: now.toISOString(),
          state: this.il.states[id]!,
          value: this.il.values[id] ?? null,
        });

    if (!this.il.healthy) {
      // Abort and restore within one tick (invariant 3: < 60 s), without the cloud.
      if (this.dispatcher.active.size) {
        for (const x of this.executors.values()) x.step(now, false, this.il.why);
        this.dispatcher.abortAndRestoreAll(now, this.il.why);
        this.ceiling.reset();
      }
      return;
    }

    this.ceiling.step(now, this.projected, true);

    // Heat pumps: send only on a mode change; the dispatcher keeps ceiling priority and headroom.
    const ist = new Date(now.getTime() + IST_MS);
    const soc = this.latest.get('hw-tanks.soc_pct')?.value ?? 100;
    const want = heatPumpMode(this.hpPolicy, ist.getUTCHours() * 60 + ist.getUTCMinutes(), soc);
    if (want.mode !== this.hp.mode && !this.ceiling.held.some((h) => h.assetId === 'heatpump')) {
      const action = want.mode === 'auto' ? 'restore' : want.mode;
      const r = this.dispatcher.send(
        { assetId: 'heatpump', action, reason: 'schedule', params: { why: want.why } },
        now,
      );
      if (r.result === 'ok') this.hp = want;
    } else if (want.mode === this.hp.mode) this.hp = want;

    for (const [id, x] of this.executors) {
      x.step(now, true);
      if (['done', 'aborted', 'rejected'].includes(x.phase)) {
        this.acks.push({ id, result: x.phase as IntentAck['result'], detail: null });
        this.executors.delete(id);
      }
    }
  }

  /** Intents pulled from the cloud. Abort intents stop a running event; DR intents get an executor. */
  accept(intents: EdgeIntent[], now: Date) {
    for (const i of intents) {
      if (i.kind === 'abort') {
        for (const [id, x] of this.executors)
          if (x.intent.eventId === i.eventId) {
            x.abort(now, 'duty engineer abort');
            this.acks.push({ id, result: 'aborted', detail: 'duty engineer abort' });
            this.executors.delete(id);
          }
        this.acks.push({ id: i.id, result: 'done', detail: null });
        continue;
      }
      if (this.executors.has(i.id)) continue;
      const log = (l: { phase: string; message: string; at: string }) => {
        if (i.eventId)
          this.emit({
            kind: 'dr_log',
            eventId: i.eventId,
            at: l.at,
            entry: l.phase,
            detail: { message: l.message, intentId: i.id },
          });
      };
      const x = new DrExecutor({ ...i, eventId: i.eventId }, this.classes, this.dispatcher, log);
      this.executors.set(i.id, x);
      this.acks.push({ id: i.id, result: 'accepted', detail: null });
    }
  }

  takeAcks(): IntentAck[] {
    return this.acks.splice(0);
  }
  requeueAcks(a: IntentAck[]) {
    this.acks.unshift(...a);
  }

  state(now: Date): LiveSnapshot['control'] {
    return {
      gateHealthy: this.il.healthy,
      interlocks: Object.fromEntries(
        Object.keys(this.il.states).map((k) => [k, { state: this.il.states[k]!, value: this.il.values[k] ?? '' }]),
      ),
      active: [...this.dispatcher.active].map(([assetId, a]) => ({
        assetId,
        action: a.action,
        reason: a.reason,
        since: new Date(a.since).toISOString(),
      })),
      heatPump: this.hp,
      intents: [...this.executors].map(([id, x]) => ({ id, eventId: x.intent.eventId ?? null, phase: x.phase })),
      cloudOk: this.cloudOk && now.getTime() > 0,
    };
  }
}
