/**
 * Real-driver harness: read a device once and print every mapped point, before switching any point from the
 * simulator in edge.config.yaml (invariant 10). Never writes to the device.
 *   pnpm edge:probe --driver modbus-tcp --host 10.0.0.21 --port 502 --map apps/edge/maps/lt-panel.example.yaml
 */
import { readFileSync } from 'node:fs';
import type { Reading } from '@drm/drivers';
import { ModbusTcpDriver, type PointMap } from '@drm/drivers/modbus-tcp';
import { parse } from 'yaml';

export interface ProbeOptions {
  driver: string;
  host: string;
  port?: number;
  map: string | { points: PointMap[] };
  timeoutMs?: number;
}

export async function probe(o: ProbeOptions): Promise<{ readings: Reading[]; missing: string[]; ms: number }> {
  if (o.driver !== 'modbus-tcp')
    throw new Error(
      `probe supports modbus-tcp in this release (asked for ${o.driver}); DLMS, BACnet, OCPP and MQTT come with site commissioning`,
    );
  const map = typeof o.map === 'string' ? (parse(readFileSync(o.map, 'utf8')) as { points: PointMap[] }) : o.map;
  const d = new ModbusTcpDriver({
    id: `probe:${o.host}`,
    host: o.host,
    port: o.port ?? 502,
    points: map.points,
    timeoutMs: o.timeoutMs ?? 3000,
  });
  const t0 = Date.now();
  try {
    await d.poll(new Date());
    const readings = d.read(new Date());
    const got = new Set(readings.map((r) => r.pointId));
    return { readings, missing: map.points.map((p) => p.pointId).filter((p) => !got.has(p)), ms: Date.now() - t0 };
  } finally {
    await d.close();
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1]?.endsWith('probe.ts')) {
  const driver = arg('driver') ?? 'modbus-tcp';
  const host = arg('host');
  const map = arg('map');
  if (!host || !map) {
    console.error('usage: pnpm edge:probe --driver modbus-tcp --host HOST [--port 502] --map FILE.yaml');
    process.exit(2);
  }
  probe({ driver, host, port: Number(arg('port') ?? 502), map })
    .then((r) => {
      console.log(`read ${r.readings.length} points in ${r.ms} ms from ${host}`);
      for (const x of r.readings)
        console.log(`  ${x.pointId.padEnd(28)} ${String(Number(x.value.toFixed(3))).padStart(12)}  ${x.quality}`);
      if (r.missing.length) console.log(`missing: ${r.missing.join(', ')}`);
      process.exit(r.missing.length ? 1 : 0);
    })
    .catch((e: Error) => {
      console.error(`probe failed: ${e.message}`);
      process.exit(1);
    });
}
