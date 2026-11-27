'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { StrataChart } from '@/components/StrataChart';
import { Bar, Card, Kpi, NoData } from '@/components/ui';
import { type DayBlock, dayChart } from '@/lib/charts';
import { blockTime, inr, istDay, istTime, num } from '@/lib/format';
import { usePoll } from '@/lib/usePoll';

interface Overview {
  live: {
    kva: number;
    kw: number;
    pf: number;
    solarKw: number;
    projectedKva: number;
    hwSocPct: number | null;
    blockNo: number;
  } | null;
  sanctionKva: number;
  floorKva: number;
  ladder: { stage1: number; stage2: number; stage3: number; ceiling: number };
  ceiling: { armed: boolean; stage: number } | null;
  today: { kwh: number; kvah: number; solarKwh: number; costInr: number; peakKva: number; blocks: number };
  yesterday: { kwh: number; solarKwh: number; costInr: number; peakKva: number };
  month: { mdKva: number; mdAt: string | null; billingDemandKva: number };
  simulated: boolean;
}
interface Day {
  date: string;
  blocks: Array<{ blockNo: number; kwh: number; solarKwh: number }>;
}
interface Fc {
  today: string;
  blocks: Array<{ date: string; blockNo: number; p50: number }>;
  peak: { date: string; blockNo: number; p50: number; p90: number };
  exceedCeilingPct: number;
}

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const istYesterday = () => new Date(Date.now() + 330 * 60000 - 86400000).toISOString().slice(0, 10);

export function OverviewScreen() {
  const o = usePoll<Overview>('/api/overview', 5000);
  const today = usePoll<Day>(`/api/day?date=${istToday()}`, 60000);
  const yday = usePoll<Day>(`/api/day?date=${istYesterday()}`, 0);
  const fc = usePoll<Fc>('/api/forecast', 300000);
  const d = o.data;
  const live = d?.live ?? null;
  const pf = live?.pf || 0.94;

  const chart = useMemo(() => {
    if (!d || !today.data) return null;
    const rows: DayBlock[] = [];
    for (const b of yday.data?.blocks ?? [])
      rows.push({ date: yday.data!.date, blockNo: b.blockNo, gridKwh: b.kwh, solarKwh: b.solarKwh });
    const seen = new Map(today.data.blocks.map((b) => [b.blockNo, b]));
    const f = new Map(
      (fc.data?.blocks ?? []).filter((b) => b.date === today.data!.date).map((b) => [b.blockNo, b.p50]),
    );
    for (let n = 1; n <= 96; n++) {
      const b = seen.get(n);
      const p = f.get(n);
      rows.push({
        date: today.data.date,
        blockNo: n,
        gridKwh: b?.kwh ?? null,
        solarKwh: b?.solarKwh ?? null,
        forecastKwh: p !== undefined ? (p * pf) / 4 : null,
        planKwh: null,
      });
    }
    return dayChart(rows, {
      pf,
      floorKva: d.floorKva,
      sanctionKva: d.sanctionKva,
      title: 'Supply by source · yesterday and today',
      bands: [{ start: '10:00', end: '15:00', label: 'Solar soak' }],
    });
  }, [d, today.data, yday.data, fc.data, pf]);

  if (!d)
    return (
      <Card title="Energy Orchestration Centre">
        {o.error ? <NoData what="site data" why={o.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const L = d.ladder;
  const projected = live?.projectedKva ?? 0;
  const stage = d.ceiling?.stage ?? 0;
  const scale = (v: number) => `${(v / d.sanctionKva) * 100}%`;

  return (
    <>
      <div className="grid-2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)' }}>
        <div className="grid-k">
          <Kpi
            title="Live demand"
            value={num(live?.kva)}
            unit="kVA"
            foot={
              <>
                <span>
                  {num(live?.kw)} kW · PF {num(live?.pf, 2)}
                </span>
              </>
            }
            icon="/icons/icon-meter.svg"
          />
          <Kpi
            title="Grid draw vs sanction"
            value={live ? num((live.kva / d.sanctionKva) * 100) : '–'}
            unit="%"
            foot={<span>of {num(d.sanctionKva)} kVA sanctioned</span>}
          />
          <Kpi
            title="Peak this month"
            value={num(d.month.mdKva, 1)}
            unit="kVA"
            foot={
              <span>
                Billed at {num(d.month.billingDemandKva)} kVA · floor {num(d.floorKva)}
              </span>
            }
            tone={d.month.mdKva > L.stage1 ? 'alert' : undefined}
          />
          <Kpi
            title="Hot-water store"
            value={num(live?.hwSocPct)}
            unit="%"
            foot={<span>2 × 6,000 L at 65 °C</span>}
            tone="mint"
            icon="/icons/icon-heatpump.svg"
          />
          <Kpi
            title="Cost today"
            value={inr(d.today.costInr)}
            foot={<span>Yesterday {inr(d.yesterday.costInr)}</span>}
          />
          <Kpi
            title="Rooftop solar"
            value={num(live?.solarKw)}
            unit="kW"
            foot={<span>{num(d.today.solarKwh)} kWh today</span>}
            tone="lime"
            icon="/icons/icon-sun.svg"
          />
        </div>
        <Card
          title="Demand ceiling"
          tone="lilac"
          aside={
            <span className={`pill ${stage ? 'pill-warn' : 'pill-ok'}`}>
              {d.ceiling?.armed === false ? 'Disarmed' : `Armed · Stage ${stage}`}
            </span>
          }
        >
          <div className="num-xl">
            {num(projected)}
            <span className="unit">kVA projected this block</span>
          </div>
          <div
            style={{ position: 'relative', height: 50, marginTop: 14 }}
            role="img"
            aria-label={`Projected ${num(projected)} kVA against ceiling ${L.ceiling} kVA`}
          >
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: 0,
                right: 0,
                height: 12,
                borderRadius: 999,
                background: 'rgba(255,255,255,.6)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 14,
                left: 0,
                width: scale(Math.min(projected, d.sanctionKva)),
                height: 12,
                borderRadius: 999,
                background: projected >= L.stage1 ? '#b4541a' : '#1f7a3c',
              }}
            />
            {[
              [d.floorKva, 'floor'],
              [L.stage1, 'Stage 1'],
              [L.ceiling, 'ceiling'],
              [d.sanctionKva, 'sanction'],
            ].map(([v, t], i) => (
              <div
                key={String(t)}
                style={{
                  position: 'absolute',
                  left: scale(Number(v)),
                  top: i % 2 ? -10 : 4,
                  transform: 'translateX(-50%)',
                  textAlign: 'center',
                  fontSize: 11,
                  color: '#33443b',
                  display: 'flex',
                  flexDirection: i % 2 ? 'column-reverse' : 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: 2,
                    height: i % 2 ? 26 : 32,
                    background: t === 'sanction' ? '#b3261e' : '#10231a',
                    opacity: 0.7,
                    marginTop: i % 2 ? 0 : 0,
                  }}
                />
                <span>{num(Number(v))}</span>
              </div>
            ))}
          </div>
          <div className="note">
            Block {live?.blockNo ?? '–'} ({live ? blockTime(live.blockNo) : '–'}). ergOS sheds non-clinical load from
            Stage 1 at {L.stage1} kVA so no block passes {L.ceiling} kVA. Today&apos;s peak so far{' '}
            {num(d.today.peakKva, 1)} kVA.
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Solar soak" tone="mint">
          <div className="kv" style={{ borderTop: 0, paddingTop: 0 }}>
            <div>
              <div>Store charge</div>
              <div className="num-m">{num(live?.hwSocPct)}%</div>
            </div>
            <div>
              <div>Solar now</div>
              <div className="num-m">{num(live?.solarKw)} kW</div>
            </div>
            <div>
              <div>Solar today</div>
              <div className="num-m">{num(d.today.solarKwh)} kWh</div>
            </div>
          </div>
          <Bar pct={live?.hwSocPct ?? 0} label="Hot-water store charge" color="#1f9a50" />
          <div className="note">
            Heat pumps run at full output 10:00–15:00 on rooftop solar and stay off through the evening peak; the store
            carries the wards until morning.
          </div>
        </Card>
        <Card
          title="DR event today"
          aside={
            <Link className="btn btn-glass" href="/optimizer">
              Open DR optimizer
            </Link>
          }
        >
          <div className="num-m">
            {fc.data
              ? `Forecast peak ${num(fc.data.peak.p50)} kVA at ${blockTime(fc.data.peak.blockNo)}`
              : 'Forecast loading…'}
          </div>
          <div className="note">
            {fc.data
              ? `P90 ${num(fc.data.peak.p90)} kVA · chance of passing ${L.ceiling} kVA: ${num(fc.data.exceedCeilingPct, 1)}%. `
              : ''}
            No DR event is planned for today. Events are proposed, approved and armed from the DR optimizer.
          </div>
        </Card>
      </div>

      <Card title="24-hour supply and peak management" pad="pad-l">
        {chart ? (
          <StrataChart
            options={chart}
            minHeight={340}
            label="Solar and grid supply by 15-minute block, yesterday and today, with today's forecast"
          />
        ) : (
          <NoData what="blocks" />
        )}
        <div className="grid-3">
          <Kpi
            title="Grid import today"
            value={num(d.today.kwh)}
            unit="kWh"
            foot={<span>{num(d.today.kvah)} kVAh billed basis</span>}
          />
          <Kpi
            title="Solar today"
            value={num(d.today.solarKwh)}
            unit="kWh"
            foot={<span>Yesterday {num(d.yesterday.solarKwh)} kWh</span>}
            tone="lime"
          />
          <Kpi
            title="Energy cost today"
            value={inr(d.today.costInr)}
            foot={<span>At the HV-1 kVAh rate with duty</span>}
          />
        </div>
      </Card>
      <p className="note" style={{ margin: '0 6px' }}>
        {d.simulated
          ? 'Simulated data: readings come from the hospital simulator calibrated to the MVVNL bills, until site meters are connected. '
          : ''}
        Tariff, sanctioned load and billed demand come from the MVVNL bills. Month peak recorded{' '}
        {d.month.mdAt ? `${istDay(d.month.mdAt)} at ${istTime(d.month.mdAt)}` : '–'}.
      </p>
    </>
  );
}
