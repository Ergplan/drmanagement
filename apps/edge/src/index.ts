/**
 * Edge runtime (VM now, on-site gateway later). Reads drivers every 10 s, keeps 1-minute readings, IST blocks and
 * days in a local outbox, and uplinks signed batches. Stage 4 adds the ceiling loop, interlocks and dispatcher here,
 * so they keep running when the cloud is unreachable.
 */
import { Outbox } from './buffer';
import { Collector } from './collector';
import { env, loadConfig } from './config';
import { DriverSet } from './drivers';
import { sendBatch } from './uplink';

const VERSION = '0.2.0';
const started = Date.now();
const cfg = loadConfig();
const uplink = { cloudUrl: env('CLOUD_URL'), deviceId: env('DEVICE_ID'), deviceSecret: env('DEVICE_SECRET') };
const drivers = new DriverSet(cfg);
const outbox = new Outbox();
const collector = new Collector({
  readings: (rows) => outbox.pushMany('reading', rows),
  block: (b) => outbox.push('block', b),
  day: (d) => outbox.push('day', d),
});

const TICK_MS = Number(process.env.EDGE_TICK_MS ?? 10_000);
const UPLINK_MS = Number(process.env.EDGE_UPLINK_MS ?? 10_000);
let failures = 0;

function tick() {
  const now = new Date();
  drivers.poll(now);
  collector.tick(now, drivers.read(now));
}

async function flush() {
  const readings = outbox.take('reading', 6000);
  const blocks = outbox.take('block', 200);
  const days = outbox.take('day', 30);
  const events = outbox.take('event', 500);
  try {
    await sendBatch(uplink, {
      health: {
        version: VERSION,
        uptimeS: Math.round((Date.now() - started) / 1000),
        drivers: drivers.health(),
        bufferedBatches: outbox.size(),
      },
      live: collector.live(new Date()),
      readings: readings.map((r) => r.payload) as never,
      blocks: blocks.map((r) => r.payload) as never,
      days: days.map((r) => r.payload) as never,
      events: events.map((r) => r.payload) as never,
    });
    outbox.ack([...readings, ...blocks, ...days, ...events].map((r) => r.id));
    if (failures)
      console.log(`uplink restored after ${failures} failed attempts; ${outbox.size()} rows still buffered`);
    failures = 0;
  } catch (e) {
    failures += 1;
    if (failures === 1 || failures % 30 === 0)
      console.error(`uplink failed (${failures}); buffering locally: ${(e as Error).message}`);
  }
}

console.log(
  `edge ${VERSION} · ${uplink.deviceId} → ${uplink.cloudUrl} · drivers ${[...drivers.drivers.keys()].join(', ')}`,
);
tick();
setInterval(tick, TICK_MS);
setInterval(() => void flush(), UPLINK_MS);
