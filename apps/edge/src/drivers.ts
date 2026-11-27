import { readFileSync } from 'node:fs';
import type { Driver, Reading } from '@drm/drivers';
import { ModbusTcpDriver, type PointMap } from '@drm/drivers/modbus-tcp';
import { SimDriver } from '@drm/drivers/sim';
import { parse } from 'yaml';
import type { EdgeConfig } from './config';

/** Builds the configured drivers and returns only the readings each point is assigned to (invariant 10). */
export class DriverSet {
  readonly drivers = new Map<string, Driver>();
  constructor(private readonly cfg: EdgeConfig) {
    for (const [id, d] of Object.entries(cfg.drivers)) {
      if (d.type === 'sim')
        this.drivers.set(
          id,
          new SimDriver({
            seed: d.seed ?? 42,
            scenario: (process.env.SIM_SCENARIO ?? d.scenario ?? 'normal') as never,
          }),
        );
      else if (d.type === 'modbus-tcp') {
        // map file: { points: PointMap[], actuations?: ActuationMap[] }
        const map = parse(readFileSync(String(d.map), 'utf8')) as { points: PointMap[]; actuations?: never[] };
        this.drivers.set(
          id,
          new ModbusTcpDriver({
            id,
            host: String(d.host),
            port: Number(d.port ?? 502),
            points: map.points,
            actuations: map.actuations,
          }),
        );
      } else
        console.warn(`driver ${id}: type ${d.type} is not wired in this release; its points fall back to "no data"`);
    }
  }
  private assigned(pointId: string): string {
    return this.cfg.points.overrides[pointId] ?? this.cfg.points.default;
  }
  /** Start an async poll on drivers that talk to real devices; their latest values are served by read(). */
  poll(now: Date) {
    for (const [id, d] of this.drivers) {
      const p = (d as { poll?: (n: Date) => Promise<void> }).poll;
      if (p) p.call(d, now).catch((e: Error) => console.error(`driver ${id} poll failed: ${e.message}`));
    }
  }

  read(now: Date): Reading[] {
    const out: Reading[] = [];
    for (const [id, d] of this.drivers) {
      try {
        for (const r of d.read(now)) if (this.assigned(r.pointId) === id) out.push(r);
      } catch (e) {
        console.error(`driver ${id} read failed`, (e as Error).message);
      }
    }
    return out;
  }
  /** Driver that owns an asset's actuation: the driver assigned to the asset's main kW point. */
  forAsset(): Driver | undefined {
    return this.drivers.get(this.cfg.points.default);
  }
  health(): Record<string, 'ok' | 'degraded' | 'down'> {
    return Object.fromEntries([...this.drivers].map(([id, d]) => [id, d.health()]));
  }
}
