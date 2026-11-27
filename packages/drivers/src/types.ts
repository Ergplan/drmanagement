/** Driver contract shared by the simulator and real meter drivers (invariant 10). */
export type Quality = 'good' | 'estimated' | 'stale' | 'bad';

export interface Reading {
  pointId: string;
  ts: Date;
  value: number;
  source: string; // 'sim' or a device id
  quality: Quality;
}

export interface ActuateCommand {
  assetId: string;
  action: string; // shed | restore | setpoint | lock | unlock | run | hold
  params?: Record<string, number | string | boolean>;
}

export interface ActuateResult {
  ok: boolean;
  detail?: string;
}

export interface Driver {
  readonly id: string;
  /** Current value of every point this driver serves. */
  read(now: Date): Reading[];
  /** Only Dispatcher.send() may call this (invariant 2). */
  actuate(cmd: ActuateCommand, now: Date): ActuateResult;
  health(): 'ok' | 'degraded' | 'down';
}
