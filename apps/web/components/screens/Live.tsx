'use client';
import { useMemo } from 'react';
import { StrataChart } from '@/components/StrataChart';
import { Card, ClassTag, Kpi, NoData } from '@/components/ui';
import { dayChart } from '@/lib/charts';
import { num } from '@/lib/format';
import { type DayResp, istToday, type NodeResp, type PointsResp } from '@/lib/types';
import { usePoll } from '@/lib/usePoll';

export function LiveScreen() {
  const pts = usePoll<PointsResp>('/api/live/points', 5000);
  const nodes = usePoll<NodeResp[]>('/api/nodes', 0);
  const day = usePoll<DayResp>(`/api/day?date=${istToday()}`, 60000);
  const site = usePoll<{ sanctionKva: number; floorKva: number }>('/api/overview', 60000);
  const p = (id: string) => pts.data?.points[id]?.v;

  const chart = useMemo(() => {
    if (!day.data || !site.data) return null;
    const kvah = day.data.blocks.reduce((a, b) => a + b.kvah, 0);
    const pf = kvah > 0 ? day.data.blocks.reduce((a, b) => a + b.kwh, 0) / kvah : 0.94;
    return dayChart(
      day.data.blocks.map((b) => ({ date: day.data!.date, blockNo: b.blockNo, gridKwh: b.kwh, solarKwh: b.solarKwh })),
      { pf, floorKva: site.data.floorKva, sanctionKva: site.data.sanctionKva, title: 'Supply by source · today' },
    );
  }, [day.data, site.data]);

  const uses = useMemo(() => {
    if (!day.data || !nodes.data) return [];
    const tot: Record<string, number> = {};
    for (const b of day.data.blocks) for (const [k, v] of Object.entries(b.assetKwh)) tot[k] = (tot[k] ?? 0) + v;
    const all = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
    return nodes.data
      .filter((n) => tot[n.id] !== undefined && n.drClass !== 'meter')
      .map((n) => ({ ...n, kwh: tot[n.id]!, share: (tot[n.id]! / all) * 100 }))
      .sort((a, b) => b.kwh - a.kwh);
  }, [day.data, nodes.data]);

  if (!pts.data)
    return (
      <Card title="Live energy">
        {pts.error ? <NoData what="live readings" why={pts.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Apparent power"
          value={num(p('ht-meter.kva'))}
          unit="kVA"
          foot={<span>Billed basis (kVA, kVAh)</span>}
          icon="/icons/icon-meter.svg"
        />
        <Kpi title="Active power" value={num(p('ht-meter.kw'))} unit="kW" />
        <Kpi
          title="Power factor"
          value={num(p('ht-meter.pf'), 3)}
          foot={<span>APFC steps in service {num(p('lt-main.apfc_steps'))}</span>}
          tone={(p('ht-meter.pf') ?? 1) < 0.95 ? 'alert' : undefined}
        />
        <Kpi title="Reactive power" value={num(p('ht-meter.kvar'))} unit="kvar" />
        <Kpi
          title="Supply"
          value={num((p('ht-meter.v_ll') ?? 0) / 1000, 2)}
          unit="kV"
          foot={
            <span>
              {num(p('ht-meter.hz'), 2)} Hz · THD-V {num(p('lt-main.thd_v'), 1)}%
            </span>
          }
        />
        <Kpi
          title="Solar"
          value={num(p('solar.kw'))}
          unit="kW"
          foot={<span>Export 0 kW</span>}
          tone="lime"
          icon="/icons/icon-sun.svg"
        />
      </div>
      <Card title="Supply by source" pad="pad-l">
        {chart ? (
          <StrataChart options={chart} minHeight={320} label="Solar and grid supply by 15-minute block today" />
        ) : (
          <NoData what="blocks" />
        )}
      </Card>
      <div className="grid-2">
        <Card title="Where the energy goes today">
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>End use</th>
                  <th className="r">Today kWh</th>
                  <th className="r">Share</th>
                  <th>DR class</th>
                </tr>
              </thead>
              <tbody>
                {uses.map((u) => (
                  <tr key={u.id}>
                    <td>{u.title}</td>
                    <td className="r">{num(u.kwh)}</td>
                    <td className="r">{num(u.share, 1)}%</td>
                    <td>
                      <ClassTag cls={u.drClass} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Feeders now" aside={<span className="note">1-minute readings</span>}>
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Point</th>
                  <th className="r">kW now</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(nodes.data ?? [])
                  .filter((n) => p(`${n.id}.kw`) !== undefined && !['ht-meter', 'lt-main'].includes(n.id))
                  .map((n) => (
                    <tr key={n.id}>
                      <td>{n.title}</td>
                      <td className="r">{num(p(`${n.id}.kw`), 1)}</td>
                      <td>
                        {n.drClass === 'protected' || n.drClass === 'critical' ? (
                          <span className="tag tag-crit">Excluded</span>
                        ) : (
                          <ClassTag cls={n.drClass} />
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <p className="note" style={{ margin: '0 6px' }}>
        MVVNL bills energy in kVAh and demand in kVA, so power factor matters: at PF {num(p('ht-meter.pf'), 2)} the
        hospital pays for about {num((1 / (p('ht-meter.pf') || 1) - 1) * 100, 1)}% more than it uses.
      </p>
    </>
  );
}
