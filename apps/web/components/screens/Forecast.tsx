'use client';
import { useMemo } from 'react';
import { StrataChart } from '@/components/StrataChart';
import { Card, Kpi, NoData } from '@/components/ui';
import { forecastChart } from '@/lib/charts';
import { blockTime, num } from '@/lib/format';
import { usePoll } from '@/lib/usePoll';

interface Fc {
  today: string;
  dates: string[];
  actual: Array<number | null>;
  blocks: Array<{ date: string; blockNo: number; p10: number; p50: number; p90: number }>;
  likeDays: Record<string, string[]>;
  adjustment: number;
  peak: { date: string; blockNo: number; p50: number; p90: number };
  exceedCeilingPct: number;
  exceedStage1Pct: number;
  floorKva: number;
  sanctionKva: number;
  method: string;
}

export function ForecastScreen() {
  const { data, error } = usePoll<Fc>('/api/forecast', 300000);
  const chart = useMemo(() => {
    if (!data) return null;
    const rows = data.blocks.map((b) => ({
      ...b,
      actual: b.date === data.today ? (data.actual[b.blockNo - 1] ?? null) : null,
    }));
    return forecastChart(rows, data.floorKva, data.sanctionKva, [data.dates[0]!, data.dates[2]!]);
  }, [data]);
  if (!data)
    return (
      <Card title="Demand forecast">
        {error ? <NoData what="forecast" why={error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const dayPeak = (d: string) =>
    data.blocks
      .filter((b) => b.date === d)
      .reduce((a, b) => (b.p50 > a.p50 ? b : a), { p50: 0, p90: 0, blockNo: 1, date: d, p10: 0 });
  const [t0, t1, t2] = data.dates.map(dayPeak);
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Today's peak (P50)"
          value={num(t0!.p50)}
          unit="kVA"
          foot={
            <span>
              at {blockTime(t0!.blockNo)} · P90 {num(t0!.p90)}
            </span>
          }
        />
        <Kpi
          title="Tomorrow"
          value={num(t1!.p50)}
          unit="kVA"
          foot={
            <span>
              at {blockTime(t1!.blockNo)} · P90 {num(t1!.p90)}
            </span>
          }
        />
        <Kpi
          title="Day after"
          value={num(t2!.p50)}
          unit="kVA"
          foot={
            <span>
              at {blockTime(t2!.blockNo)} · P90 {num(t2!.p90)}
            </span>
          }
        />
        <Kpi
          title="Chance of passing 570 kVA"
          value={num(data.exceedCeilingPct, 1)}
          unit="%"
          foot={<span>Stage 1 at 520: {num(data.exceedStage1Pct, 1)}%</span>}
          tone={data.exceedCeilingPct > 5 ? 'alert' : 'mint'}
        />
      </div>
      <Card title="Next 48 hours" pad="pad-l">
        {chart ? (
          <StrataChart
            options={chart}
            minHeight={320}
            label="Metered demand today and the forecast band for the next two days"
          />
        ) : null}
      </Card>
      <Card title="What drives the forecast">
        <table className="tbl">
          <thead>
            <tr>
              <th>Input</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {data.dates.map((d) => (
              <tr key={d}>
                <td>Like days for {d}</td>
                <td>{(data.likeDays[d] ?? []).join(', ') || '–'}</td>
              </tr>
            ))}
            <tr>
              <td>Same-day level adjustment</td>
              <td>{num((data.adjustment - 1) * 100, 1)}% from today&apos;s metered blocks (capped ±10%)</td>
            </tr>
            <tr>
              <td>Method</td>
              <td>{data.method}</td>
            </tr>
            <tr>
              <td>Weather, occupancy, OT and imaging schedules</td>
              <td>Not yet used: weather from the edge and the hospital HIS feed are added later (see Known gaps).</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </>
  );
}
