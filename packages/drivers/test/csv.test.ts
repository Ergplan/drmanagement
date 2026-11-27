import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/csv';

describe('CSV import', () => {
  it('parses point_id, ts, value and skips bad rows', () => {
    const r = parseCsv(
      'point_id,ts,value\nht-meter.kva,2026-11-27T09:00:00Z,265\nht-meter.kva,not-a-date,1\nsolar.kw,2026-11-27T09:00:00Z,x\n',
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pointId: 'ht-meter.kva', value: 265, source: 'import' });
  });
});
