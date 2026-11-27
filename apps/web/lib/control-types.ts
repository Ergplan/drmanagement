export interface ControlState {
  gateHealthy: boolean;
  interlocks: Record<string, { state: 'healthy' | 'tripped' | 'stale'; value: string }>;
  active: Array<{ assetId: string; action: string; reason: string; since: string }>;
  heatPump: { mode: string; why: string };
  intents: Array<{ id: string; eventId: string | null; phase: string }>;
  cloudOk: boolean;
}

export interface StageRule {
  stage: number;
  trigger_projected_kva: number;
  shed?: string[];
  actions?: string[];
  expect_kw: number;
  response: string;
  restore: string;
}

export interface ControlResp {
  edge: { online: boolean; ageS: number | null };
  live: { projectedKva?: number; kva?: number; blockNo?: number; blockElapsedMin?: number; at?: string } | null;
  control: ControlState | null;
  ceiling: { armed: boolean; stage: number; projectedKva: number | null; updatedAt: string } | null;
  ladder: { stage1: number; stage2: number; stage3: number; ceiling: number; sanction: number };
  rules: { reserve_kva: number; restore_step_minutes: number; stages: StageRule[] } | null;
  heatPumps: {
    solar_soak: { start: string; end: string };
    locked_off: { start: string; end: string };
    standby_top_up_below_soc_pct: number;
  } | null;
  interlocks: Array<{ id: string; name: string; limit: string }>;
  commands: Array<{
    id: string;
    assetId: string;
    action: string;
    reason: string;
    intentId: string | null;
    sentAt: string;
    result: string;
    detail: string | null;
  }>;
  ceilingActions: Array<{
    id: number;
    at: string;
    stage: number;
    kind: string;
    assetId: string | null;
    projectedKva: number;
  }>;
  interlockEvents: Array<{ id: number; interlockId: string; at: string; state: string; value: string | null }>;
  audit: Array<{
    id: number;
    actor: string;
    action: string;
    entity: string;
    entityId: string | null;
    at: string;
    after: unknown;
  }>;
}
