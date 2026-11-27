/**
 * The ONLY actuator path (invariant 2). Every command from the ceiling, the heat-pump scheduler, a DR event or a
 * duty engineer goes through Dispatcher.send(), which enforces clinical exclusion (invariant 1) and the interlock
 * gate (invariant 3), calls the driver and records the result.
 */
export type DrClass = 'flexible' | 'conditional' | 'protected' | 'critical' | 'meter';
export type Reason = 'ceiling' | 'dr' | 'schedule' | 'restore' | 'manual';

export interface Actuator {
  actuate(
    cmd: { assetId: string; action: string; params?: Record<string, number | string | boolean> },
    now: Date,
  ): { ok: boolean; detail?: string };
}

export interface CommandRecord {
  kind: 'command';
  id: string;
  assetId: string;
  action: string;
  params: Record<string, unknown>;
  reason: Reason;
  intentId: string | null;
  sentAt: string;
  result: 'ok' | 'refused' | 'failed';
  detail: string | null;
}

export interface SendRequest {
  assetId: string;
  action: string; // shed | setpoint | lock | run | restore
  reason: Reason;
  params?: Record<string, number | string | boolean>;
  intentId?: string | null;
  /** abort path only: restore even when it adds demand (clinical safety beats savings) */
  force?: boolean;
}

/** Actions that add load back and so must respect the ceiling (invariant 4). */
const RAISES = new Set(['restore', 'run']);

let seq = 0;
const newId = (now: Date) => `cmd-${now.getTime().toString(36)}-${(seq++).toString(36)}`;

export class Dispatcher {
  /** asset → what is currently applied and who applied it */
  readonly active = new Map<string, { action: string; reason: Reason; since: number }>();

  constructor(
    private readonly classes: Record<string, DrClass>,
    private readonly actuator: Actuator,
    private readonly record: (c: CommandRecord) => void,
    private readonly gate: () => { healthy: boolean; why: string },
    /** projected 15-min block kVA and the Stage 1 trigger; restores and runs wait while projected >= trigger */
    private readonly headroom: () => { projectedKva: number; restoreBelowKva: number } = () => ({
      projectedKva: 0,
      restoreBelowKva: Number.POSITIVE_INFINITY,
    }),
  ) {}

  static allowed(cls: DrClass | undefined): boolean {
    return cls === 'flexible' || cls === 'conditional';
  }

  send(req: SendRequest, now: Date): CommandRecord {
    const base = {
      kind: 'command' as const,
      id: newId(now),
      assetId: req.assetId,
      action: req.action,
      params: req.params ?? {},
      reason: req.reason,
      intentId: req.intentId ?? null,
      sentAt: now.toISOString(),
    };
    const refuse = (why: string) => {
      const c: CommandRecord = { ...base, result: 'refused', detail: why };
      this.record(c);
      return c;
    };
    if (!Dispatcher.allowed(this.classes[req.assetId]))
      return refuse(`clinical exclusion: ${req.assetId} is ${this.classes[req.assetId] ?? 'unknown'}`);
    const cur = this.active.get(req.assetId);
    if (!req.force) {
      if (req.action !== 'restore') {
        const g = this.gate();
        if (!g.healthy) return refuse(`interlock gate: ${g.why}`);
      }
      // The ceiling has priority: nothing but the ceiling itself changes or releases an asset it holds.
      if (cur && cur.reason === 'ceiling' && req.reason !== 'ceiling' && !(req.reason === 'restore' && !req.intentId))
        return refuse('asset held by the demand ceiling');
      if (RAISES.has(req.action)) {
        const h = this.headroom();
        if (h.projectedKva >= h.restoreBelowKva)
          return refuse(
            `projected ${h.projectedKva.toFixed(0)} kVA is at or above ${h.restoreBelowKva} kVA; load not added back`,
          );
      }
    }
    if (req.action === 'restore' && !cur && !req.force && req.reason !== 'schedule') {
      const c: CommandRecord = { ...base, result: 'ok', detail: 'nothing to restore' };
      return c;
    }
    let res: { ok: boolean; detail?: string };
    try {
      res = this.actuator.actuate({ assetId: req.assetId, action: req.action, params: req.params }, now);
    } catch (e) {
      res = { ok: false, detail: (e as Error).message };
    }
    if (res.ok) {
      if (req.action === 'restore') this.active.delete(req.assetId);
      else this.active.set(req.assetId, { action: req.action, reason: req.reason, since: now.getTime() });
    }
    const c: CommandRecord = { ...base, result: res.ok ? 'ok' : 'failed', detail: res.detail ?? null };
    this.record(c);
    return c;
  }

  /** Interlock trip, watchdog or duty-engineer abort: restore every active curtailment at once. */
  abortAndRestoreAll(now: Date, why: string): CommandRecord[] {
    return [...this.active.keys()].map((assetId) =>
      this.send({ assetId, action: 'restore', reason: 'restore', params: { why }, force: true }, now),
    );
  }
}
