import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseDiscomEmail } from '../src/discom';
import { startTestVtn } from '../src/test-vtn';
import { durationMs, Ven } from '../src/ven';

let vtn: Awaited<ReturnType<typeof startTestVtn>>;
beforeAll(async () => {
  vtn = await startTestVtn(18088);
});
afterAll(() => new Promise<void>((r) => vtn.server.close(() => r())));

describe('OpenADR 3.0 VEN', () => {
  it('parses ISO durations', () => {
    expect(durationMs('PT2H')).toBe(7200000);
    expect(durationMs('PT15M')).toBe(900000);
    expect(durationMs('P1DT30M')).toBe(86400000 + 1800000);
  });
  it('authenticates, polls the test VTN and maps an event to a signal', async () => {
    const ven = new Ven({
      vtnUrl: vtn.url,
      clientId: 'ven-globe',
      clientSecret: 'test-secret',
      venName: 'globe-lko',
      programs: ['MVVNL-DR-PILOT'],
    });
    expect(await ven.poll()).toEqual([]);
    vtn.events.push({
      id: 'evt-1',
      programID: 'prog-1',
      modificationDateTime: '2026-11-27T10:00:00Z',
      intervals: [
        {
          id: 0,
          intervalPeriod: { start: '2099-11-28T12:30:00Z', duration: 'PT1H' },
          payloads: [{ type: 'LOAD_DISPATCH', values: [-60] }],
        },
        {
          id: 1,
          intervalPeriod: { start: '2099-11-28T13:30:00Z', duration: 'PT1H' },
          payloads: [{ type: 'LOAD_DISPATCH', values: [-40] }],
        },
      ],
    });
    const [s] = await ven.poll();
    expect(s?.externalId).toBe('evt-1@2026-11-27T10:00:00Z');
    expect(s?.start.toISOString()).toBe('2099-11-28T12:30:00.000Z');
    expect(s?.end.toISOString()).toBe('2099-11-28T14:30:00.000Z');
    expect(s?.targetKw).toBe(60);
  });
  it('fails closed on bad credentials', async () => {
    const ven = new Ven({ vtnUrl: vtn.url, clientId: 'ven-globe', clientSecret: 'wrong', venName: 'x' });
    await expect(ven.poll()).rejects.toThrow(/auth 401/);
  });
  it('skips events that have ended', async () => {
    vtn.events.push({
      id: 'old',
      programID: 'prog-1',
      intervalPeriod: { start: '2020-01-01T00:00:00Z', duration: 'PT1H' },
      intervals: [{ id: 0, payloads: [{ type: 'LOAD_DISPATCH', values: [-10] }] }],
    });
    const ven = new Ven({ vtnUrl: vtn.url, clientId: 'ven-globe', clientSecret: 'test-secret', venName: 'x' });
    expect((await ven.poll()).map((s) => s.externalId)).not.toContain('old@');
  });
});

describe('DISCOM email parser', () => {
  it('reads date, window, kW and reference', () => {
    const s = parseDiscomEmail(
      'Dear consumer, under the DR pilot please reduce 60 kW on 28/11/2026 from 18:00 to 20:00 hrs. Ref: MVVNL/DR/2026/14',
    );
    expect(s?.start.toISOString()).toBe('2026-11-28T12:30:00.000Z');
    expect(s?.end.toISOString()).toBe('2026-11-28T14:30:00.000Z');
    expect(s?.targetKw).toBe(60);
    expect(s?.externalId).toBe('MVVNL/DR/2026/14');
  });
  it('returns null rather than guessing when the window is missing', () => {
    expect(parseDiscomEmail('Please reduce load tomorrow evening.')).toBeNull();
  });
});
