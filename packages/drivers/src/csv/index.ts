/**
 * CSV import driver: loads interval exports from a meter or BMS (columns: point_id, ts ISO, value) and serves them
 * as readings with source "import". Used for historical data before live meters are connected.
 */
import { readFileSync } from 'node:fs';
import type { ActuateResult, Driver, Reading } from '../types';

export function parseCsv(text: string, source = 'import'): Reading[] {
  const out: Reading[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = (lines.shift() ?? '').split(',').map((h) => h.trim().toLowerCase());
  const [ip, it, iv] = ['point_id', 'ts', 'value'].map((k) => header.indexOf(k));
  if (ip! < 0 || it! < 0 || iv! < 0) throw new Error('CSV needs columns point_id, ts, value');
  for (const l of lines) {
    const c = l.split(',');
    const ts = new Date(c[it!]!.trim());
    const value = Number(c[iv!]);
    if (Number.isNaN(ts.getTime()) || !Number.isFinite(value)) continue;
    out.push({ pointId: c[ip!]!.trim(), ts, value, source, quality: 'good' });
  }
  return out;
}

export class CsvDriver implements Driver {
  readonly id: string;
  private rows: Reading[];
  constructor(opt: { id: string; path: string }) {
    this.id = opt.id;
    this.rows = parseCsv(readFileSync(opt.path, 'utf8'));
  }
  /** Readings at or before `now` that have not been served yet. */
  read(now: Date): Reading[] {
    const due = this.rows.filter((r) => r.ts.getTime() <= now.getTime());
    this.rows = this.rows.filter((r) => r.ts.getTime() > now.getTime());
    return due;
  }
  actuate(): ActuateResult {
    return { ok: false, detail: 'CSV import cannot actuate' };
  }
  health(): 'ok' {
    return 'ok';
  }
}
