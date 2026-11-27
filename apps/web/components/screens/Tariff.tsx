'use client';
import { useMemo } from 'react';
import { CsvButton } from '@/components/CsvButton';
import { StrataChart } from '@/components/StrataChart';
import { Card, Kpi, NoData } from '@/components/ui';
import { billedMd } from '@/lib/charts';
import { inr, num } from '@/lib/format';
import { usePoll } from '@/lib/usePoll';

interface Bill {
  id: string;
  label: string;
  periodFrom: string;
  periodTo: string;
  days: number;
  kvah: number;
  billedKva: number;
  months: number;
  pf: number | null;
  total: number;
  note: string | null;
  lines: Array<{ kind: string; amount: number }>;
  recomputed: { energy: number; demand: number; duty: number; total: number } | null;
  audit: { excessKvah: number; excessInr: number; ratio: number } | null;
}
interface BillsResp {
  bills: Bill[];
  billedDemand: Array<{ month: string; kva: number }>;
  normalKvahPerDay: number | null;
  normalFrom: string | null;
}
interface Tariff {
  energyRatePerKvah: number;
  demandRatePerKvaMonth: number;
  dutyPct: number;
  floorPct: number;
}

export function TariffScreen() {
  const b = usePoll<BillsResp>('/api/bills', 0);
  const t = usePoll<Tariff[]>('/api/tariff', 0);
  const o = usePoll<{ sanctionKva: number; floorKva: number; ratePerKvah: number }>('/api/overview', 0);
  const chart = useMemo(
    () => (b.data && o.data ? billedMd(b.data.billedDemand, o.data.floorKva, o.data.sanctionKva) : null),
    [b.data, o.data],
  );
  const tr = t.data?.[0];
  if (!b.data || !tr)
    return (
      <Card title="Tariffs & cost">
        {b.error ? <NoData what="bills" why={b.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const line = (x: Bill, k: string) => x.lines.find((l) => l.kind === k)?.amount ?? 0;
  const flagged = b.data.bills.filter((x) => x.audit && x.audit.ratio > 1.3);
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Energy"
          value={`₹${num(tr.energyRatePerKvah, 2)}`}
          unit="per kVAh"
          foot={<span>Flat, no time of day</span>}
        />
        <Kpi
          title="Demand"
          value={`₹${num(tr.demandRatePerKvaMonth)}`}
          unit="per kVA a month"
          foot={
            <span>
              Floor {num(o.data?.floorKva)} kVA ({num(tr.floorPct * 100)}% of contract)
            </span>
          }
        />
        <Kpi title="Electricity duty" value={num(tr.dutyPct, 1)} unit="%" />
        <Kpi
          title="All-in energy"
          value={`₹${num(o.data?.ratePerKvah, 2)}`}
          unit="per kVAh"
          foot={<span>With duty, before fuel adjustment</span>}
        />
      </div>
      <Card
        title="Bills on file"
        aside={
          <CsvButton
            name="bills"
            rows={b.data.bills.map((x) => ({
              bill: x.label,
              from: x.periodFrom,
              to: x.periodTo,
              days: x.days,
              kvah: x.kvah,
              billedKva: x.billedKva,
              total: x.total,
              engineTotal: x.recomputed?.total ?? null,
              excessKvah: x.audit?.excessKvah ?? null,
            }))}
          />
        }
      >
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Bill</th>
                <th>Period</th>
                <th className="r">kVAh</th>
                <th className="r">kVAh a day</th>
                <th className="r">Billed kVA</th>
                <th className="r">PF</th>
                <th className="r">Energy</th>
                <th className="r">Demand</th>
                <th className="r">Fuel adj.</th>
                <th className="r">Duty</th>
                <th className="r">Bill</th>
                <th className="r">Engine check</th>
              </tr>
            </thead>
            <tbody>
              {b.data.bills.map((x) => (
                <tr key={x.id}>
                  <td>{x.label}</td>
                  <td>
                    {x.periodFrom} to {x.periodTo}
                  </td>
                  <td className="r">{num(x.kvah)}</td>
                  <td className="r">{num(x.kvah / x.days)}</td>
                  <td className="r">
                    {num(x.billedKva)}
                    {x.months > 1 ? ` × ${x.months}` : ''}
                  </td>
                  <td className="r">{num(x.pf, 2)}</td>
                  <td className="r">{inr(line(x, 'energy'))}</td>
                  <td className="r">{inr(line(x, 'demand'))}</td>
                  <td className="r">{inr(line(x, 'fuel_adj'))}</td>
                  <td className="r">{inr(line(x, 'duty'))}</td>
                  <td className="r">
                    {inr(x.total)}
                    {x.note ? <div className="note">{x.note}</div> : null}
                  </td>
                  <td className="r">
                    {x.recomputed
                      ? inr(x.recomputed.energy + x.recomputed.demand + line(x, 'fuel_adj') + x.recomputed.duty)
                      : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ margin: 0 }}>
          Engine check recomputes energy, demand and duty from the tariff with the same code that prices every block
          (packages/domain).
        </p>
      </Card>
      {flagged.map((x) => (
        <Card key={x.id} title={`${x.label} bill looks wrong`} tone="alert">
          <div className="num-l">{inr(x.audit!.excessInr)}</div>
          <p className="note" style={{ margin: 0 }}>
            The {x.label} bill charges {num(x.kvah / x.days)} kVAh a day for {x.days} days, {num(x.audit!.ratio, 1)}{' '}
            times the {num(b.data!.normalKvahPerDay)} a day on the {b.data!.normalFrom} bill. That is{' '}
            {num(x.audit!.excessKvah)} kVAh above normal use, worth {inr(x.audit!.excessInr)} at the energy rate. Raise
            it with MVVNL with this evidence.
          </p>
        </Card>
      ))}
      <Card title="Billed demand, last 12 bills" pad="pad-l">
        {chart ? (
          <StrataChart
            options={chart}
            minHeight={240}
            label="Billed maximum demand by month against the floor and sanction"
          />
        ) : null}
      </Card>
    </>
  );
}
