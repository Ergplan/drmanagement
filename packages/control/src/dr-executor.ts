/**
 * DR event executor at the edge. Runs an approved, armed `dr_intent` pulled from the cloud through its phases
 * (precondition → event → restore → recovery). It re-validates the intent itself (invariant 2: the cloud never
 * actuates), sends every action through the dispatcher, restores loads one at a time, and aborts on any
 * interlock trip or duty-engineer abort.
 */
import type { Dispatcher } from './dispatcher';

export interface DrIntent {
  id: string;
  eventId?: string | null;
  startsAt: string; // ISO UTC
  endsAt: string;
  targetKw: number;
  /** ordered actions applied at event start; restored in reverse */
  actions: Array<{ assetId: string; action: string; params?: Record<string, number | string | boolean> }>;
  /** optional pre-event actions (pre-cool, top-up store) and lead time */
  precondition?: {
    leadMin: number;
    actions: Array<{ assetId: string; action: string; params?: Record<string, number | string | boolean> }>;
  };
  approvals: {
    facilityManager: boolean;
    medicalSuperintendent: boolean | null;
    armedBy: string | null;
    armedAt: string | null;
  };
  /** IST HH:MM deadline for arming on the event day */
  armBy: string;
}

export type DrPhase = 'pending' | 'precondition' | 'event' | 'restore' | 'recovery' | 'done' | 'aborted' | 'rejected';

export interface DrLog {
  kind: 'dr_log';
  intentId: string;
  at: string;
  phase: DrPhase;
  message: string;
}

const IST_MS = 330 * 60000;
function istHmOnDate(iso: string, hm: string): number {
  const d = new Date(new Date(iso).getTime() + IST_MS);
  const [h, m] = hm.split(':').map(Number);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h ?? 0, m ?? 0) - IST_MS;
}

/** Reasons an intent must not run; empty means valid. */
export function validateIntent(i: DrIntent, classes: Record<string, string>, now: Date): string[] {
  const bad: string[] = [];
  const s = Date.parse(i.startsAt);
  const e = Date.parse(i.endsAt);
  if (!(e > s)) bad.push('window ends before it starts');
  if (e - s > 4 * 3600000) bad.push('window longer than 4 hours');
  if (now.getTime() >= e) bad.push('window already over');
  if (!i.approvals.facilityManager) bad.push('facility manager has not approved');
  const hvac = i.actions.some((a) => ['chiller', 'ahu'].includes(a.assetId));
  if (hvac && i.approvals.medicalSuperintendent !== true) bad.push('HVAC action needs the medical superintendent');
  if (!i.approvals.armedBy || !i.approvals.armedAt) bad.push('duty engineer has not armed it');
  else if (Date.parse(i.approvals.armedAt) > istHmOnDate(i.startsAt, i.armBy)) bad.push(`armed after ${i.armBy}`);
  for (const a of [...i.actions, ...(i.precondition?.actions ?? [])])
    if (classes[a.assetId] !== 'flexible' && classes[a.assetId] !== 'conditional')
      bad.push(`clinical exclusion: ${a.assetId} is ${classes[a.assetId] ?? 'unknown'}`);
  return bad;
}

export class DrExecutor {
  phase: DrPhase = 'pending';
  private applied: string[] = [];
  private lastRestoreMs = 0;

  constructor(
    readonly intent: DrIntent,
    private readonly classes: Record<string, string>,
    private readonly dispatcher: Dispatcher,
    private readonly log: (l: DrLog) => void,
    private readonly restoreStepMin = 10,
  ) {}

  private say(now: Date, phase: DrPhase, message: string) {
    this.phase = phase;
    this.log({ kind: 'dr_log', intentId: this.intent.id, at: now.toISOString(), phase, message });
  }

  /** Call every loop tick. gateHealthy false => abort. */
  step(now: Date, gateHealthy: boolean, gateWhy = ''): void {
    if (this.phase === 'done' || this.phase === 'aborted' || this.phase === 'rejected') return;
    const t = now.getTime();
    const s = Date.parse(this.intent.startsAt);
    const e = Date.parse(this.intent.endsAt);

    if (this.phase === 'pending') {
      const bad = validateIntent(this.intent, this.classes, now);
      if (bad.length) {
        this.say(now, 'rejected', `Refused at the edge: ${bad.join('; ')}`);
        return;
      }
    }
    if (!gateHealthy && (this.phase === 'precondition' || this.phase === 'event')) {
      this.abort(now, `interlock: ${gateWhy}`, true);
      return;
    }

    const pre = this.intent.precondition;
    const lead = (pre?.leadMin ?? 0) * 60000;
    if (pre && this.phase === 'pending' && lead > 0 && t >= s - lead && t < s) {
      if (!gateHealthy) return;
      for (const a of pre.actions) {
        const r = this.dispatcher.send({ ...a, reason: 'dr', intentId: this.intent.id }, now);
        if (r.result === 'ok') this.applied.push(a.assetId);
      }
      this.say(now, 'precondition', `Preconditioning ${pre.actions.map((a) => a.assetId).join(', ')}`);
      return;
    }
    if ((this.phase === 'pending' || this.phase === 'precondition') && t >= s && t < e) {
      if (!gateHealthy) return;
      const ok: string[] = [];
      const no: string[] = [];
      for (const a of this.intent.actions) {
        const r = this.dispatcher.send({ ...a, reason: 'dr', intentId: this.intent.id }, now);
        if (r.result === 'ok') {
          if (!this.applied.includes(a.assetId)) this.applied.push(a.assetId);
          ok.push(a.assetId);
        } else no.push(`${a.assetId} (${r.detail})`);
      }
      this.say(
        now,
        'event',
        `Event started: ${ok.join(', ') || 'nothing applied'}${no.length ? `; refused ${no.join(', ')}` : ''}`,
      );
      return;
    }
    if ((this.phase === 'event' || this.phase === 'precondition') && t >= e) {
      this.lastRestoreMs = 0;
      this.say(now, 'restore', `Window ended; restoring ${this.applied.length} loads ${this.restoreStepMin} min apart`);
    }
    if (this.phase === 'restore') {
      if (this.applied.length && t - this.lastRestoreMs >= this.restoreStepMin * 60000) {
        const id = this.applied[this.applied.length - 1] as string;
        const r = this.dispatcher.send(
          { assetId: id, action: 'restore', reason: 'restore', intentId: this.intent.id },
          now,
        );
        // Held by the ceiling: the ceiling now owns it. Refused for headroom: try again next step.
        if (r.result === 'ok' || r.detail === 'asset held by the demand ceiling') this.applied.pop();
        this.lastRestoreMs = t;
      }
      if (!this.applied.length) this.say(now, 'recovery', 'All loads restored; watching rebound');
      return;
    }
    if (this.phase === 'recovery' && t >= e + 60 * 60000) this.say(now, 'done', 'Event complete');
  }

  /** Duty-engineer abort or interlock trip: restore everything this event applied, immediately. */
  abort(now: Date, why: string, trip = false): void {
    // A trip restores regardless of headroom; an engineer abort still leaves ceiling-held loads to the ceiling.
    for (const id of this.applied.reverse())
      this.dispatcher.send(
        { assetId: id, action: 'restore', reason: 'restore', intentId: this.intent.id, params: { why }, force: trip },
        now,
      );
    this.applied = [];
    this.say(now, 'aborted', `Aborted: ${why}`);
  }
}
