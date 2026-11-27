'use client';
import { useMemo } from 'react';
import { StrataChart } from '@/components/StrataChart';
import { Card, Kpi, NoData } from '@/components/ui';
import { solarDaily } from '@/lib/charts';
import { num } from '@/lib/format';
import type { PointsResp } from '@/lib/types';
import { usePoll } from '@/lib/usePoll';

interface SolarResp {
  days: Array<{ day: string; solarKwh: number; kwh: number }>;
  kwp: number | null;
  gridFactor: number | null;
}

export function SolarScreen() {
  const s = usePoll<SolarResp>('/api/solar', 300000);
  const pts = usePoll<PointsResp>('/api/live/points', 5000);
  const p = (id: string) => pts.data?.points[id]?.v;
  const last30 = useMemo(() => (s.data?.days ?? []).slice(-30), [s.data]);
  const chart = useMemo(() => (s.data ? solarDaily(s.data.days.slice(-62)) : null), [s.data]);
  if (!s.data)
    return (
      <Card title="Solar & backup">
        {s.error ? <NoData what="solar data" why={s.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const kwh30 = last30.reduce((a, d) => a + d.solarKwh, 0);
  const kwp = s.data.kwp;
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Solar now"
          value={num(p('solar.kw'))}
          unit="kW"
          foot={
            <span>
              of {num(kwp)} kWp · {num(p('solar.irradiance_wm2'))} W/m²
            </span>
          }
          tone="lime"
          icon="/icons/icon-sun.svg"
        />
        <Kpi
          title="Last 30 days"
          value={num(kwh30)}
          unit="kWh"
          foot={<span>{kwp ? num(kwh30 / kwp / Math.max(1, last30.length), 2) : '–'} kWh/kWp a day</span>}
        />
        <Kpi
          title="Used on site"
          value="100"
          unit="%"
          foot={<span>Zero export: solar is capped at the site load</span>}
          tone="mint"
        />
        <Kpi
          title="CO₂ avoided, 30 days"
          value={num((kwh30 * (s.data.gridFactor ?? 0)) / 1000, 1)}
          unit="t"
          foot={<span>CEA grid factor {num(s.data.gridFactor, 3)} tCO₂/MWh</span>}
        />
      </div>
      <Card title="Daily yield" pad="pad-l">
        {chart ? <StrataChart options={chart} minHeight={240} label="Daily rooftop solar generation" /> : null}
      </Card>
      <Card title="Backup readiness">
        <div className="grid-3">
          <Kpi
            title="UPS load"
            value={num(p('ups.load_pct'))}
            unit="%"
            foot={<span>Autonomy {num(p('ups.autonomy_min'))} min · 2 × 200 kVA</span>}
          />
          <Kpi
            title="DG sets"
            value={p('dg.state') ? 'Running' : 'Standby'}
            foot={
              <span>
                Fuel {num(p('dg.fuel_l'))} L · last test {num(p('dg.last_test'))} days ago
              </span>
            }
            tone={p('dg.state') ? 'alert' : undefined}
          />
          <Kpi
            title="Grid supply"
            value={(p('ht-meter.v_ll') ?? 0) > 1000 ? 'Healthy' : 'Outage'}
            foot={<span>{num((p('ht-meter.v_ll') ?? 0) / 1000, 2)} kV</span>}
            tone={(p('ht-meter.v_ll') ?? 0) > 1000 ? 'mint' : 'alert'}
          />
        </div>
        <p className="note" style={{ margin: 0 }}>
          The DG sets cover a grid outage only. ergOS never starts them to hold the ceiling or for a DR event, and
          backup capacity is never counted as flexibility.
        </p>
      </Card>
    </>
  );
}
