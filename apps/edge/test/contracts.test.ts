/** Edge ↔ cloud contract: what the edge produces parses with the cloud's schemas, and signatures verify. */
import { createHmac } from 'node:crypto';
import { EDGE_HEADERS, EdgeIntent, IngestBatch, IntentAck } from '@drm/contracts';
import { describe, expect, it } from 'vitest';
import { signedHeaders } from '../src/intents';
import { intent, run } from './harness';

describe('edge ↔ cloud contract', () => {
  it('a real hour of edge output (readings, blocks, events, live snapshot with control) is a valid IngestBatch', () => {
    const date = '2026-06-12';
    const r = run({
      scenario: 'hot_june_evening',
      date,
      from: '18:00',
      to: '19:00',
      intents: [{ at: '18:00', intent: intent({ id: 'c1', date, from: '18:15', to: '18:45' }) }],
    });
    const now = new Date(r.t('19:00'));
    const batch = {
      batchId: 'b-contract-1',
      deviceId: 'edge-globe-lko-01',
      sentAt: now.toISOString(),
      health: { version: 't', uptimeS: 3600, drivers: { sim: 'ok' as const }, bufferedBatches: 0 },
      live: undefined,
      readings: [{ p: 'ht-meter.kva', t: now.toISOString(), v: 512.3, s: 'sim', q: 'good' as const }],
      blocks: r.blocks,
      days: [],
      events: r.events,
    };
    const parsed = IngestBatch.safeParse(batch);
    if (!parsed.success) console.log(parsed.error.issues.slice(0, 3));
    expect(parsed.success).toBe(true);
    expect(r.events.some((e) => e.kind === 'command')).toBe(true);
    expect(r.events.some((e) => e.kind === 'ceiling')).toBe(true);
    expect(r.events.some((e) => e.kind === 'dr_log')).toBe(true);
  });

  it('intents and acks round-trip through their schemas', () => {
    const i = intent({ id: 'c2', date: '2026-11-18', from: '17:30', to: '20:00' });
    expect(EdgeIntent.parse(JSON.parse(JSON.stringify(i)))).toEqual(i);
    expect(EdgeIntent.safeParse({ ...i, actions: [{ assetId: 'icu', action: 'explode' }] }).success).toBe(false);
    expect(IntentAck.parse({ id: 'c2', result: 'accepted', detail: null }).result).toBe('accepted');
  });

  it('signed requests verify with the cloud rule HMAC(secret, `${ts}.${body}`)', () => {
    const cfg = { cloudUrl: 'http://x', deviceId: 'edge-globe-lko-01', deviceSecret: 's3cret' };
    const body = '{"acks":[]}';
    const h = signedHeaders(cfg, body) as Record<string, string>;
    const want = createHmac('sha256', 's3cret').update(`${h[EDGE_HEADERS.timestamp]}.${body}`).digest('hex');
    expect(h[EDGE_HEADERS.signature]).toBe(want);
    expect(h[EDGE_HEADERS.device]).toBe('edge-globe-lko-01');
  });
});
