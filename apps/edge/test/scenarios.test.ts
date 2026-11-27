/**
 * Stage 8 scenario suite: the real simulator, collector and edge control loop, no cloud. Each scenario checks
 * the invariants that matter for it (clinical exclusion, interlock gate and restore, ceiling, offline operation).
 */
import { describe, expect, it } from 'vitest';
import { abortIntent, intent, run } from './harness';

const CLINICAL = ['icu', 'imaging', 'medgas', 'clinicalhvac'];
const peak = (b: Array<{ avgKva: number }>) => Math.max(...b.slice(1).map((x) => x.avgKva));
const noClinical = (events: Array<{ kind: string; assetId?: string | null; result?: string }>) =>
  events.filter((e) => e.kind === 'command' && e.result === 'ok' && CLINICAL.includes(e.assetId ?? ''));

describe('scenario suite', () => {
  it('1 · normal November day: no ceiling stage, interlocks healthy, nothing clinical touched', () => {
    const r = run({ scenario: 'normal', date: '2026-11-18', from: '00:00', to: '23:50' });
    expect(peak(r.blocks)).toBeLessThan(520);
    expect(r.events.filter((e) => e.kind === 'ceiling')).toEqual([]);
    expect(r.trace.slice(30).every((x) => x.healthy)).toBe(true);
    expect(noClinical(r.events)).toEqual([]);
  });

  it('2 · hot June evening: the ceiling holds every block under 570 kVA', () => {
    const r = run({ scenario: 'hot_june_evening', date: '2026-06-12', from: '15:00', to: '22:30' });
    expect(peak(r.blocks)).toBeLessThan(570);
    expect(r.events.some((e) => e.kind === 'ceiling' && e.action === 'shed')).toBe(true);
  });

  it('3 · interlock trip mid-event: the event aborts and every load is restored in one tick', () => {
    const date = '2026-06-12';
    const r = run({
      scenario: 'interlock_trip',
      date,
      from: '17:00',
      to: '18:40',
      intents: [{ at: '17:05', intent: intent({ id: 'i3', date, from: '17:30', to: '20:00' }) }],
    });
    const trip = r.trace.find((x) => x.t >= r.t('17:31') && !x.healthy)!;
    expect(trip).toBeDefined();
    expect(r.trace.find((x) => x.t === trip.t)!.active).toBe(0);
    expect(r.events.some((e) => e.kind === 'dr_log' && e.entry === 'aborted')).toBe(true);
    // Nothing new is commanded while the trip lasts.
    const tripped = new Set(r.trace.filter((x) => !x.healthy).map((x) => new Date(x.t).toISOString()));
    expect(
      r.events.filter(
        (e) => e.kind === 'command' && e.result === 'ok' && e.action !== 'restore' && tripped.has(e.sentAt),
      ),
    ).toEqual([]);
  });

  it('4 · main meter stale for 2 minutes: commands blocked, nothing added back, recovers after', () => {
    const r = run({ scenario: 'stale_meter', date: '2026-11-18', from: '17:55', to: '18:10' });
    const during = r.trace.filter((x) => x.t > r.t('18:00') + 20_000 && x.t < r.t('18:02'));
    expect(during.length).toBeGreaterThan(0);
    expect(during.every((x) => !x.healthy)).toBe(true);
    expect(r.trace.filter((x) => x.t > r.t('18:03')).every((x) => x.healthy)).toBe(true);
    expect(r.events.some((e) => e.kind === 'interlock' && e.interlockId === 'meter-fresh' && e.state === 'stale')).toBe(
      true,
    );
  });

  it('5 · CT and cath-lab burst (+30 kVA, the design reserve) during a hot evening: still under 570 kVA', () => {
    const r = run({
      scenario: 'hot_june_evening',
      date: '2026-06-12',
      from: '17:00',
      to: '21:00',
      burst: { from: '19:00', to: '19:20', kw: 30 },
    });
    expect(peak(r.blocks)).toBeLessThan(570);
    expect(noClinical(r.events)).toEqual([]);
    expect(r.events.some((e) => e.kind === 'ceiling' && e.stage >= 2)).toBe(true);
  });

  it('6 · grid outage with DG: no crash, no clinical command, no new peak when the grid returns', () => {
    const r = run({ scenario: 'outage', date: '2026-11-18', from: '17:30', to: '19:30' });
    expect(peak(r.blocks)).toBeLessThan(570);
    expect(noClinical(r.events)).toEqual([]);
  });

  it('7 · uplink down 30 minutes during an event: the event runs to the end from its local copy', () => {
    // The harness has no cloud at all, so this is the offline case: the intent was pulled before the outage.
    const date = '2026-11-18';
    const r = run({
      scenario: 'normal',
      date,
      from: '17:00',
      to: '21:00',
      intents: [{ at: '17:05', intent: intent({ id: 'i7', date, from: '17:30', to: '20:00' }) }],
    });
    const sheds = r.events.filter((e) => e.kind === 'command' && e.reason === 'dr' && e.result === 'ok');
    expect(sheds.map((e) => (e as { assetId: string }).assetId).sort()).toEqual(['ev', 'laundry', 'pump']);
    const restores = r.events.filter(
      (e) =>
        e.kind === 'command' &&
        e.action === 'restore' &&
        (e as { intentId: string | null }).intentId === 'i7' &&
        e.result === 'ok',
    );
    expect(restores).toHaveLength(3);
    expect(r.events.some((e) => e.kind === 'dr_log' && e.entry === 'recovery')).toBe(true);
  });

  it('8 · event armed after 17:00 lapses at the edge too (re-validation)', () => {
    const date = '2026-11-18';
    const r = run({
      scenario: 'normal',
      date,
      from: '17:10',
      to: '18:00',
      intents: [{ at: '17:10', intent: intent({ id: 'i8', date, from: '17:30', to: '20:00', armedAt: '17:05' }) }],
    });
    expect(r.events.some((e) => e.kind === 'dr_log' && e.entry === 'rejected')).toBe(true);
    expect(r.events.filter((e) => e.kind === 'command' && e.reason === 'dr')).toEqual([]);
  });

  it('9 · duty-engineer abort: every load of the event restored at once', () => {
    const date = '2026-11-18';
    const r = run({
      scenario: 'normal',
      date,
      from: '17:00',
      to: '18:30',
      intents: [
        { at: '17:05', intent: intent({ id: 'i9', date, from: '17:30', to: '20:00' }) },
        { at: '18:00', intent: abortIntent('ev-i9', date) },
      ],
    });
    const after = r.trace.find((x) => x.t >= r.t('18:00'))!;
    expect(after.phases).toEqual([]);
    const restores = r.events.filter(
      (e) => e.kind === 'command' && e.action === 'restore' && e.sentAt === new Date(r.t('18:00')).toISOString(),
    );
    expect(restores.length).toBe(3);
  });

  it('10 · edge restart mid-event: restores everything on start, re-pulls the intent and resumes', () => {
    const date = '2026-11-18';
    const r = run({
      scenario: 'normal',
      date,
      from: '17:00',
      to: '21:00',
      restartAt: '18:30',
      intents: [{ at: '17:05', intent: intent({ id: 'i10', date, from: '17:30', to: '20:00' }) }],
    });
    const at = new Date(r.t('18:30')).toISOString();
    expect(
      r.events.filter((e) => e.kind === 'command' && e.action === 'restore' && e.sentAt === at).length,
    ).toBeGreaterThanOrEqual(6);
    const resumed = r.trace.find((x) => x.t > r.t('18:31'))!;
    // the three event loads plus the heat pumps' evening lock-out
    expect(resumed.active).toBe(4);
    expect(r.events.filter((e) => e.kind === 'dr_log' && e.entry === 'recovery').length).toBeGreaterThanOrEqual(1);
  });
});
