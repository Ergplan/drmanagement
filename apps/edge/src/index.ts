/**
 * Edge runtime (VM now, on-site gateway later). Reads drivers every 10 s, keeps 1-minute readings, IST blocks and
 * days in a local outbox, and uplinks signed batches. The control loop (interlocks, ceiling, heat pumps, DR
 * executors, dispatcher) runs in the same tick, so it keeps running when the cloud is unreachable.
 */
import { Outbox } from './buffer';
import { Collector } from './collector';
import { env, loadConfig } from './config';
import { EdgeControl } from './control';
import { DriverSet } from './drivers';
import { pullIntents, sendAcks, signedHeaders } from './intents';
import { singleInstance } from './lock';
import { renderPending } from './reports';
import { sendBatch } from './uplink';

const VERSION = '0.3.0';
const started = Date.now();
singleInstance(`${process.env.EDGE_BUFFER ?? new URL('../data/outbox.sqlite', import.meta.url).pathname}.lock`);
const cfg = loadConfig();
const uplink = { cloudUrl: env('CLOUD_URL'), deviceId: env('DEVICE_ID'), deviceSecret: env('DEVICE_SECRET') };
const drivers = new DriverSet(cfg);
const outbox = new Outbox();
const collector = new Collector({
  readings: (rows) => outbox.pushMany('reading', rows),
  block: (b) => outbox.push('block', b),
  day: (d) => outbox.push('day', d),
});

const control = new EdgeControl(
  () => drivers.forAsset(),
  (e) => outbox.push('event', e),
);

const TICK_MS = Number(process.env.EDGE_TICK_MS ?? 10_000);
const UPLINK_MS = Number(process.env.EDGE_UPLINK_MS ?? 10_000);
let failures = 0;

function tick() {
  const now = new Date();
  drivers.poll(now);
  const readings = drivers.read(now);
  collector.tick(now, readings);
  try {
    control.step(now, readings, collector.live(now)?.projectedKva);
  } catch (e) {
    // A control fault must not leave loads curtailed: restore everything and keep the loop alive.
    console.error('control step failed; restoring all loads', e);
    control.dispatcher.abortAndRestoreAll(now, 'control fault');
    control.ceiling.reset();
  }
}

function snapshot(now: Date) {
  const live = collector.live(now, {
    armed: control.ceiling.armed,
    stage: control.ceiling.stage,
    held: control.ceiling.held.map((h) => h.assetId),
  });
  return live ? { ...live, control: control.state(now) } : undefined;
}

async function syncIntents() {
  const acks = control.takeAcks();
  try {
    if (acks.length) await sendAcks(uplink, acks);
    control.accept(await pullIntents(uplink), new Date());
    control.cloudOk = true;
  } catch {
    control.requeueAcks(acks);
    control.cloudOk = false; // running intents and the ceiling carry on locally
  }
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
      live: snapshot(new Date()),
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
control.safeStart(new Date());
tick();
setInterval(tick, TICK_MS);
setInterval(() => void flush(), UPLINK_MS);
setInterval(() => void syncIntents(), Number(process.env.EDGE_INTENTS_MS ?? 5_000));
// Report PDFs: one render pass at a time, every 30 s.
let rendering = false;
setInterval(
  () => {
    if (rendering) return;
    rendering = true;
    renderPending(uplink)
      .catch((e: Error) => console.error(`report jobs: ${e.message}`))
      .finally(() => {
        rendering = false;
      });
  },
  Number(process.env.EDGE_REPORTS_MS ?? 30_000),
);
// Cloud housekeeping (OpenADR VTN poll, notice escalation), triggered from here so nothing depends on Vercel Cron.
setInterval(
  () => {
    fetch(new URL('/api/edge/housekeeping', uplink.cloudUrl), {
      headers: signedHeaders(uplink, ''),
      signal: AbortSignal.timeout(60_000),
    })
      .then(async (r) => {
        const j = (await r.json()) as { grid?: { results?: unknown[] }; escalated?: number };
        if (j.grid?.results?.some((x) => (x as { status?: string }).status !== 'duplicate') || j.escalated)
          console.log(`housekeeping: ${JSON.stringify(j)}`);
      })
      .catch((e: Error) => console.error(`housekeeping: ${e.message}`));
  },
  Number(process.env.EDGE_HOUSEKEEPING_MS ?? 300_000),
);
