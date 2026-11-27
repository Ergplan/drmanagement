import type { BlockRow, DayRow, LiveSnapshot, ReadingRow } from '@drm/contracts';
import { blockIndexIST, blockStartIST, HV1_GLOBE, istDate, marginalRatePerKvah, projectedBlockKva } from '@drm/domain';
import type { Reading } from '@drm/drivers';

type Q = ReadingRow['q'];
const WORST: Q[] = ['good', 'estimated', 'stale', 'bad'];
const worse = (a: Q, b: Q): Q => (WORST.indexOf(a) >= WORST.indexOf(b) ? a : b);

/**
 * Turns raw driver readings into 1-minute averages, IST 15-minute blocks, IST days and a live snapshot.
 * All block and money maths come from packages/domain (invariant 5).
 */
export class Collector {
  private minuteStart = 0;
  private acc = new Map<string, { sum: number; n: number; s: string; q: Q }>();
  private latest = new Map<string, Reading>();
  private lastTickMs = 0;
  private block: {
    start: number;
    firstMs: number;
    kwh: number;
    kvah: number;
    kvarh: number;
    solarKwh: number;
    maxKva: number;
    asset: Record<string, number>;
    source: string;
    q: Q;
  } | null = null;
  private day: {
    date: string;
    kwh: number;
    kvah: number;
    solarKwh: number;
    md: number;
    asset: Record<string, number>;
    source: string;
  } | null = null;
  private monthKey = '';
  private monthMd = 0;
  private readonly rate = marginalRatePerKvah(HV1_GLOBE);

  constructor(
    private readonly emit: {
      readings: (r: ReadingRow[]) => void;
      block: (b: BlockRow) => void;
      day: (d: DayRow) => void;
    },
  ) {}

  private v(id: string): number | undefined {
    return this.latest.get(id)?.value;
  }

  tick(now: Date, readings: Reading[]): void {
    const ms = now.getTime();
    const minute = Math.floor(ms / 60000) * 60000;
    if (this.minuteStart && minute !== this.minuteStart) this.flushMinute();
    this.minuteStart = minute;
    for (const r of readings) {
      this.latest.set(r.pointId, r);
      const a = this.acc.get(r.pointId) ?? { sum: 0, n: 0, s: r.source, q: 'good' as Q };
      a.sum += r.value;
      a.n += 1;
      a.s = r.source;
      a.q = worse(a.q, r.quality);
      this.acc.set(r.pointId, a);
    }
    const dtH = this.lastTickMs ? Math.min(0.1, (ms - this.lastTickMs) / 3600000) : 0;
    this.lastTickMs = ms;

    const bs = blockStartIST(now).getTime();
    if (this.block && this.block.start !== bs) this.flushBlock();
    if (!this.block)
      this.block = {
        start: bs,
        firstMs: ms,
        kwh: 0,
        kvah: 0,
        kvarh: 0,
        solarKwh: 0,
        maxKva: 0,
        asset: {},
        source: 'sim',
        q: 'good',
      };
    const meter = this.latest.get('ht-meter.kva');
    const kva = this.v('ht-meter.kva') ?? 0;
    const b = this.block;
    b.kvah += kva * dtH;
    b.kwh += (this.v('ht-meter.kw') ?? 0) * dtH;
    b.kvarh += (this.v('ht-meter.kvar') ?? 0) * dtH;
    b.solarKwh += (this.v('solar.kw') ?? 0) * dtH;
    b.maxKva = Math.max(b.maxKva, kva);
    if (meter) {
      b.source = meter.source;
      b.q = worse(b.q, meter.quality);
    }
    for (const r of readings) {
      if (r.pointId.endsWith('.kw') && !r.pointId.startsWith('ht-meter') && !r.pointId.startsWith('lt-main')) {
        const node = r.pointId.slice(0, -3);
        b.asset[node] = (b.asset[node] ?? 0) + r.value * dtH;
      }
    }
  }

  private flushMinute() {
    const t = new Date(this.minuteStart).toISOString();
    const rows: ReadingRow[] = [];
    for (const [p, a] of this.acc) rows.push({ p, t, v: Math.round((a.sum / a.n) * 1000) / 1000, s: a.s, q: a.q });
    this.acc.clear();
    if (rows.length) this.emit.readings(rows);
  }

  private flushBlock() {
    const b = this.block!;
    const start = new Date(b.start);
    // Started (or restarted) mid-block: fill the unseen minutes at the first observed rate and mark it estimated.
    const missingH = (b.firstMs - b.start) / 3600000;
    if (missingH > 1 / 60) {
      const seenH = Math.max(1 / 360, (this.lastTickMs - b.firstMs) / 3600000);
      const f = (seenH + missingH) / seenH;
      b.kwh *= f;
      b.kvah *= f;
      b.kvarh *= f;
      b.solarKwh *= f;
      for (const k of Object.keys(b.asset)) b.asset[k] = (b.asset[k] ?? 0) * f;
      b.q = worse(b.q, 'estimated');
    }
    const avgKva = b.kvah * 4;
    this.emit.block({
      blockStart: start.toISOString(),
      blockNo: blockIndexIST(start),
      kwh: b.kwh,
      kvah: b.kvah,
      kvarh: b.kvarh,
      avgKva,
      maxKva: b.maxKva,
      solarKwh: b.solarKwh,
      assetKwh: Object.fromEntries(Object.entries(b.asset).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
      source: b.source,
      quality: b.q,
    });
    const date = istDate(start);
    const mk = date.slice(0, 7);
    if (mk !== this.monthKey) {
      this.monthKey = mk;
      this.monthMd = 0;
    }
    this.monthMd = Math.max(this.monthMd, avgKva);
    if (this.day && this.day.date !== date) this.flushDay();
    this.day ??= { date, kwh: 0, kvah: 0, solarKwh: 0, md: 0, asset: {}, source: b.source };
    this.day.kwh += b.kwh;
    this.day.kvah += b.kvah;
    this.day.solarKwh += b.solarKwh;
    this.day.md = Math.max(this.day.md, avgKva);
    for (const [k, v] of Object.entries(b.asset)) this.day.asset[k] = (this.day.asset[k] ?? 0) + v;
    this.block = null;
  }

  private flushDay() {
    const d = this.day!;
    this.emit.day({
      day: d.date,
      kwh: d.kwh,
      kvah: d.kvah,
      mdKva: d.md,
      solarKwh: d.solarKwh,
      costInr: d.kvah * this.rate,
      assetKwh: Object.fromEntries(Object.entries(d.asset).map(([k, v]) => [k, Math.round(v)])),
      source: d.source,
    });
    this.day = null;
  }

  live(now: Date, ceiling?: LiveSnapshot['ceiling']): LiveSnapshot | undefined {
    const meter = this.latest.get('ht-meter.kva');
    if (!meter) return undefined;
    const b = this.block;
    const elapsedMin = b ? (now.getTime() - b.start) / 60000 : 0;
    // Minutes of this block before the edge was running count at the current rate (estimate).
    const unseenMin = b ? Math.max(0, (b.firstMs - b.start) / 60000) : 0;
    const blockKvah = (b?.kvah ?? 0) + (meter.value * unseenMin) / 60;
    const fresh = now.getTime() - meter.ts.getTime() < 15000;
    const dayKvah = (this.day?.kvah ?? 0) + blockKvah;
    return {
      at: now.toISOString(),
      kva: meter.value,
      kw: this.v('ht-meter.kw') ?? 0,
      kvar: this.v('ht-meter.kvar') ?? 0,
      pf: this.v('ht-meter.pf') ?? 0,
      solarKw: this.v('solar.kw') ?? 0,
      loadKw: this.v('lt-main.kw') ?? 0,
      blockNo: blockIndexIST(now),
      blockElapsedMin: elapsedMin,
      blockKvah,
      projectedKva: projectedBlockKva(blockKvah, elapsedMin, meter.value),
      monthMdKva: Math.max(this.monthMd, b ? blockKvah * 4 : 0),
      todayKwh: (this.day?.kwh ?? 0) + (b?.kwh ?? 0),
      todayKvah: dayKvah,
      todaySolarKwh: (this.day?.solarKwh ?? 0) + (b?.solarKwh ?? 0),
      todayCostInr: dayKvah * this.rate,
      hwSocPct: this.v('hw-tanks.soc_pct') ?? null,
      source: meter.source,
      quality: fresh ? meter.quality : 'stale',
      ...(ceiling ? { ceiling } : {}),
    };
  }

  /** Seed month MD and the day so far (from the cloud or local state) after a restart. */
  resume(monthMd: number) {
    this.monthMd = Math.max(this.monthMd, monthMd);
  }
}
