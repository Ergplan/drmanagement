/**
 * Demand ceiling (invariant 4): every 10 s, compare the projected 15-minute block kVA with the ladder and shed or
 * restore non-clinical loads through the dispatcher. Restores are one asset at a time, `restoreStepMin` apart,
 * and only while the projection is below Stage 1.
 */
import type { Dispatcher } from './dispatcher';

export interface StageSpec {
  stage: number;
  triggerKva: number;
  actions: Array<{ assetId: string; action: string }>;
  page?: boolean;
}

export interface CeilingConfig {
  ceilingKva: number;
  restoreBelowKva: number;
  restoreStepMin: number;
  stages: StageSpec[];
}

/** Build the ceiling config from reference/control.yaml `ceiling`. */
export function ceilingFromYaml(c: {
  ceiling_kva: number;
  restore_when_projected_below_kva: number;
  restore_step_minutes: number;
  stages: Array<{
    stage: number;
    trigger_projected_kva: number;
    commands?: Array<{ asset: string; action: string }>;
    page?: boolean;
  }>;
}): CeilingConfig {
  return {
    ceilingKva: c.ceiling_kva,
    restoreBelowKva: c.restore_when_projected_below_kva,
    restoreStepMin: c.restore_step_minutes,
    stages: c.stages.map((s) => ({
      stage: s.stage,
      triggerKva: s.trigger_projected_kva,
      actions: (s.commands ?? []).map((a) => ({ assetId: a.asset, action: a.action })),
      page: s.page,
    })),
  };
}

export interface CeilingEvent {
  kind: 'ceiling';
  at: string;
  stage: number;
  action: 'shed' | 'restore' | 'page';
  assetId: string | null;
  projectedKva: number;
}

export class Ceiling {
  stage = 0;
  armed = true;
  /** shed actions in the order applied, for last-in first-out restore */
  readonly held: Array<{ assetId: string; stage: number }> = [];
  private lastRestoreMs = 0;

  constructor(
    readonly cfg: CeilingConfig,
    private readonly dispatcher: Dispatcher,
    private readonly emit: (e: CeilingEvent) => void,
  ) {}

  step(now: Date, projectedKva: number, gateHealthy: boolean): void {
    if (!this.armed) return;
    const target = this.cfg.stages
      .filter((s) => projectedKva >= s.triggerKva)
      .reduce((m, s) => Math.max(m, s.stage), 0);
    const ev = (action: CeilingEvent['action'], stage: number, assetId: string | null) =>
      this.emit({ kind: 'ceiling', at: now.toISOString(), stage, action, assetId, projectedKva });

    if (target > this.stage && gateHealthy) {
      for (const s of this.cfg.stages.filter((x) => x.stage > this.stage && x.stage <= target)) {
        for (const a of s.actions) {
          const r = this.dispatcher.send(
            { assetId: a.assetId, action: a.action, reason: 'ceiling', params: { stage: s.stage } },
            now,
          );
          if (r.result === 'ok') {
            this.held.push({ assetId: a.assetId, stage: s.stage });
            ev('shed', s.stage, a.assetId);
          }
        }
        if (s.page) ev('page', s.stage, null);
      }
      this.stage = target;
      this.lastRestoreMs = now.getTime();
      return;
    }

    // Restore one asset at a time, only below Stage 1 and after the step interval.
    if (
      this.held.length &&
      projectedKva < this.cfg.restoreBelowKva &&
      now.getTime() - this.lastRestoreMs >= this.cfg.restoreStepMin * 60000
    ) {
      const last = this.held[this.held.length - 1]!;
      const stillHeldElsewhere = this.held.filter((h) => h.assetId === last.assetId).length > 1;
      this.held.pop();
      if (!stillHeldElsewhere)
        this.dispatcher.send(
          { assetId: last.assetId, action: 'restore', reason: 'restore', params: { stage: last.stage } },
          now,
        );
      else
        this.dispatcher.send(
          { assetId: last.assetId, action: 'setpoint', reason: 'ceiling', params: { stage: last.stage - 1 } },
          now,
        );
      ev('restore', last.stage, last.assetId);
      this.lastRestoreMs = now.getTime();
      this.stage = this.held.reduce((m, h) => Math.max(m, h.stage), 0);
    }
  }

  /** After an abort the dispatcher has restored everything; forget what was held. */
  reset() {
    this.held.length = 0;
    this.stage = 0;
  }
}
