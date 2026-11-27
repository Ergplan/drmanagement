import { describe, expect, it } from 'vitest';
import { type DayBlocks, forecast, isNonWorking } from '../src/forecast';

const day = (date: string, level: number): DayBlocks => ({
  date,
  kva: Array.from({ length: 96 }, (_, b) => level + (b === 74 ? 100 : 0)),
});

describe('forecast', () => {
  const hist = [day('2026-11-16', 300), day('2026-11-17', 320), day('2026-11-18', 340), day('2026-11-22', 200)]; // 22 Nov is a Sunday
  it('uses like days: working days for a weekday, Sundays for a Sunday', () => {
    const r = forecast(hist, { date: '2026-11-27', kva: Array(96).fill(null) }, ['2026-11-27', '2026-11-29']);
    expect(r.likeDays['2026-11-27']).toEqual(['2026-11-16', '2026-11-17', '2026-11-18']);
    expect(r.blocks.find((b) => b.date === '2026-11-27' && b.blockNo === 1)!.p50).toBeCloseTo(320);
  });
  it('falls back to all recent days when there are too few like days', () => {
    const r = forecast(hist, { date: '2026-11-27', kva: Array(96).fill(null) }, ['2026-11-29']);
    expect(r.likeDays['2026-11-29']!.length).toBeGreaterThan(1);
  });
  it('finds the peak block and orders P10 ≤ P50 ≤ P90', () => {
    const r = forecast(hist, { date: '2026-11-27', kva: Array(96).fill(null) }, ['2026-11-27']);
    expect(r.peak.blockNo).toBe(75);
    for (const b of r.blocks) expect(b.p10 <= b.p50 && b.p50 <= b.p90).toBe(true);
  });
  it('applies a same-day adjustment capped at ±10%', () => {
    const today = { date: '2026-11-27', kva: Array.from({ length: 96 }, (_, b) => (b < 40 ? 600 : null)) };
    const r = forecast(hist, today, ['2026-11-27']);
    expect(r.adjustment).toBeCloseTo(1.1);
  });
  it('gives a near-zero chance of passing 570 kVA when the peak is far below', () => {
    const r = forecast(hist, { date: '2026-11-27', kva: Array(96).fill(null) }, ['2026-11-27']);
    expect(r.exceedProbability(570)).toBeLessThan(0.01);
  });
  it('treats Sundays and listed holidays as non-working', () => {
    expect(isNonWorking('2026-11-29', new Set())).toBe(true);
    expect(isNonWorking('2026-11-27', new Set(['2026-11-27']))).toBe(true);
  });
});
