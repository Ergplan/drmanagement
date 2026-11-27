'use client';
import { useMemo } from 'react';
import { StrataChart } from '@/components/StrataChart';
import { Bar, Card, Kpi, NoData } from '@/components/ui';
import { C, pointSeries } from '@/lib/charts';
import { num } from '@/lib/format';
import type { PointsResp } from '@/lib/types';
import { usePoll } from '@/lib/usePoll';

interface Series {
  rows: Array<{ ts: string; value: number }>;
}

export function ThermalScreen() {
  const pts = usePoll<PointsResp>('/api/live/points', 5000);
  const hp = usePoll<Series>('/api/points/heatpumps.kw/series', 300000);
  const soc = usePoll<Series>('/api/points/hw-tanks.soc_pct/series', 300000);
  const p = (id: string) => pts.data?.points[id]?.v;
  const hpChart = useMemo(
    () => (hp.data ? pointSeries(hp.data.rows, 'Heat pumps · kW, last 24 hours', 'kW', C.hp, 200) : null),
    [hp.data],
  );
  const socChart = useMemo(
    () =>
      soc.data ? pointSeries(soc.data.rows, 'Hot-water store · % charge, last 24 hours', '%', C.green, 200) : null,
    [soc.data],
  );
  if (!pts.data)
    return (
      <Card title="HVAC & heat pumps">
        {pts.error ? <NoData what="readings" why={pts.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const on = (p('heatpumps.state') ?? 0) > 0;
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Hot-water store"
          value={num(p('hw-tanks.soc_pct'))}
          unit="%"
          foot={
            <span>
              Top {num(p('hw-tanks.top_c'), 1)} °C · outlet {num(p('hw-tanks.outlet_c'), 1)} °C
            </span>
          }
          tone="mint"
          icon="/icons/icon-heatpump.svg"
        />
        <Kpi
          title="Heat pumps"
          value={on ? 'Running' : 'Off'}
          foot={
            <span>
              {num(p('heatpumps.kw'), 1)} kW · COP {num(p('heatpumps.cop'), 2)}
            </span>
          }
          tone={on ? 'lime' : undefined}
        />
        <Kpi
          title="Chiller plant"
          value={num(p('chillers.kw'))}
          unit="kW"
          foot={
            <span>
              {num(p('chillers.tr'))} TR · {num(p('chillers.kw_per_tr'), 2)} kW/TR
            </span>
          }
          icon="/icons/icon-chiller.svg"
        />
        <Kpi
          title="Chilled water"
          value={num(p('chillers.chw_supply_c'), 1)}
          unit="°C"
          foot={
            <span>
              Return {num(p('chillers.chw_return_c'), 1)} °C · set {num(p('chillers.setpoint_c'), 1)} °C
            </span>
          }
        />
      </div>
      <div className="grid-2">
        <Card title="Solar soak schedule" tone="mint">
          <Bar pct={p('hw-tanks.soc_pct') ?? 0} label="Store charge" color="#1f9a50" />
          {hpChart ? (
            <StrataChart options={hpChart} minHeight={200} label="Heat pump power over the last 24 hours" />
          ) : null}
          <p className="note" style={{ margin: 0 }}>
            The store supplies the wards until 10:00; solar runs both heat pumps at full output to 15:00; they stay
            locked off 17:30–22:00. The store never serves water below 60 °C, and a weekly 70 °C cycle runs inside the
            solar window.
          </p>
        </Card>
        <Card title="Store charge">
          {socChart ? (
            <StrataChart options={socChart} minHeight={200} label="Hot-water store charge over the last 24 hours" />
          ) : null}
        </Card>
      </div>
      <div className="grid-2">
        <Card title="Air handling, non-clinical">
          <table className="tbl">
            <tbody>
              <tr>
                <td>OPD AHUs</td>
                <td className="r">{num(p('opd-ahu.kw'), 1)} kW</td>
                <td className="r">fan {num(p('opd-ahu.fan_pct'))}%</td>
                <td className="r">CO₂ {num(p('opd-ahu.co2_ppm'))} ppm</td>
              </tr>
              <tr>
                <td>Ward floors</td>
                <td className="r">{num(p('ward.kw'), 1)} kW</td>
                <td className="r">{num(p('ward.zone_temp_c'), 1)} °C</td>
                <td />
              </tr>
              <tr>
                <td>Cooling towers</td>
                <td className="r">{num(p('cooling-towers.fan_kw'), 1)} kW</td>
                <td className="r">cond. {num(p('cooling-towers.cond_c'), 1)} °C</td>
                <td />
              </tr>
            </tbody>
          </table>
        </Card>
        <Card title="Clinical air (watched, never changed)" tone="lilac">
          <table className="tbl">
            <tbody>
              <tr>
                <td>OT 1 to 4 pressure</td>
                <td className="r">{[1, 2, 3, 4].map((i) => num(p(`ot.pressure_pa_ot${i}`), 1)).join(' · ')} Pa</td>
              </tr>
              <tr>
                <td>OT temperature / RH</td>
                <td className="r">
                  {num(p('ot.temp_c'), 1)} °C · {num(p('ot.rh_pct'))}%
                </td>
              </tr>
              <tr>
                <td>ICU and NICU</td>
                <td className="r">
                  {num(p('icu.temp_c'), 1)} °C · {num(p('icu.rh_pct'))}%
                </td>
              </tr>
              <tr>
                <td>Isolation rooms</td>
                <td className="r">{num(p('isolation.pressure_pa'), 1)} Pa</td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
