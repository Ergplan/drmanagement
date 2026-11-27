import { blockIndexIST } from '@drm/domain';
import { sendBatch } from './uplink';

/**
 * Edge runtime. Stage 0: heartbeat only. Stage 2 adds drivers, simulator, buffer and uplink of readings;
 * Stage 4 adds the ceiling loop, interlocks and dispatcher (all local, independent of the cloud).
 */
const VERSION = '0.1.0';
const started = Date.now();

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`missing ${name}`);
    process.exit(1);
  }
  return v;
}

const cfg = { cloudUrl: env('CLOUD_URL'), deviceId: env('DEVICE_ID'), deviceSecret: env('DEVICE_SECRET') };

async function beat() {
  try {
    const ack = await sendBatch(cfg, {
      version: VERSION,
      uptimeS: Math.round((Date.now() - started) / 1000),
      drivers: { sim: 'ok' },
      bufferedBatches: 0,
    });
    console.log(`heartbeat ok · block ${blockIndexIST(new Date())} · ${ack.batchId}`);
  } catch (e) {
    console.error('heartbeat failed', (e as Error).message);
  }
}

await beat();
setInterval(beat, 30_000);
