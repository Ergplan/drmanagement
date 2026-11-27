import { inr, istWhen, num } from '@/lib/format';
import type { billAuditData, eventData, monthlyData, weeklyData } from '@/lib/report-data';
import { LineChart } from './Chart';

function Cover({
  eyebrow,
  title,
  sub,
  simulated,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  simulated: boolean;
}) {
  return (
    <header className="rp-cover">
      <div className="rp-eyebrow">jouleWise ergOS · {eyebrow}</div>
      <h1>{title}</h1>
      <div>
        {sub} {simulated ? <span className="rp-sim">Simulated data</span> : null}
      </div>
    </header>
  );
}

function Foot({ generated }: { generated: string }) {
  return (
    <footer className="rp-foot">
      Generated {istWhen(generated)} IST by ergOS. All demand and money figures come from the metered 15-minute blocks
      and the tariff engine (packages/domain). Savings are verified only where a settlement is shown.
    </footer>
  );
}

const Kpi = ({ v, l }: { v: string; l: string }) => (
  <div className="rp-kpi">
    <b>{v}</b>
    <span>{l}</span>
  </div>
);

export function MonthlyReport({ d, generated }: { d: Awaited<ReturnType<typeof monthlyData>>; generated: string }) {
  const beds = d.site.beds ?? 0;
  const perBedYear =
    beds && d.totals.daysMetered ? ((d.totals.kwh + d.totals.solarKwh) / beds / d.totals.daysMetered) * 365 : null;
  const co2 = d.site.gridFactor ? (d.totals.kwh / 1000) * d.site.gridFactor : null;
  const delivered = d.events.filter((e) => e.settlement);
  const value = delivered.reduce((a, e) => a + (e.settlement?.valueInr ?? 0), 0);
  return (
    <>
      <Cover
        eyebrow="Monthly performance"
        title={`${d.site.name} · ${new Date(`${d.month}-15`).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`}
        sub={`${d.totals.daysMetered} days metered.`}
        simulated={d.simulated}
      />
      <div className="rp-kpis">
        <Kpi v={num(d.totals.kvah)} l="kVAh from the grid" />
        <Kpi v={num(d.totals.solarKwh)} l="kWh from solar" />
        <Kpi v={d.peak ? num(d.peak.kva) : '–'} l={d.peak ? `peak kVA · ${istWhen(d.peak.at)}` : 'peak kVA'} />
        <Kpi v={inr(d.totals.costInr)} l="energy cost at the margin" />
      </div>
      <section className="rp-card">
        <h2>Daily energy</h2>
        <LineChart
          yLabel="kWh a day"
          series={[
            { label: 'Grid kWh', color: '#2a78d6', values: d.days.map((x) => x.kwh) },
            { label: 'Solar kWh', color: '#eda100', values: d.days.map((x) => x.solarKwh) },
          ]}
          xLabels={d.days.map((x, i) => (i % 5 === 0 ? x.day.slice(8) : ''))}
        />
      </section>
      <section className="rp-card">
        <h2>Demand against the ceiling</h2>
        <LineChart
          yLabel="Day's peak 15-minute kVA"
          series={[{ label: 'Daily peak', color: '#10231a', values: d.days.map((x) => x.mdKva) }]}
          lines={[
            { label: 'Floor', value: d.floorKva, color: '#b4541a' },
            { label: 'Stage 1', value: d.ladder.stage1, color: '#b4541a' },
            { label: 'Ceiling', value: d.ladder.ceiling, color: '#b3261e' },
          ]}
          xLabels={d.days.map((x, i) => (i % 5 === 0 ? x.day.slice(8) : ''))}
        />
        <p className="rp-note">
          Ceiling stages this month: {num(d.ceiling.stages)} loads held, highest stage {d.ceiling.maxStage || 'none'},{' '}
          {num(d.ceiling.pages)} duty-engineer pages.
        </p>
      </section>
      <section className="rp-card">
        <h2>DR events and settlement</h2>
        {d.events.length ? (
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Status</th>
                <th className="n">Target kW</th>
                <th className="n">Delivered kW</th>
                <th className="n">Performance</th>
                <th className="n">Value</th>
              </tr>
            </thead>
            <tbody>
              {d.events.map(({ event: e, settlement: s, why }) => (
                <tr key={e.id}>
                  <td>{istWhen(e.start)}</td>
                  <td>{e.status}</td>
                  <td className="n">{num(e.targetKw)}</td>
                  <td className="n">{s ? num(s.deliveredKw, 1) : '–'}</td>
                  <td className="n">{s ? `${num(s.performancePct)}%` : (why ?? '–')}</td>
                  <td className="n">{s ? inr(s.valueInr) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rp-note">No DR events this month.</p>
        )}
        <p className="rp-note">Settled value this month: {inr(value)}.</p>
      </section>
      <section className="rp-card">
        <h2>Clinical safety</h2>
        <p>
          {d.interlocks.trips.length
            ? `${d.interlocks.trips.length} interlock trips; every curtailed load was restored at the edge.`
            : 'No interlock trips.'}{' '}
          {num(d.interlocks.stale)} stale-telemetry episodes.
        </p>
        {d.interlocks.trips.length ? (
          <table>
            <tbody>
              {d.interlocks.trips.slice(0, 12).map((t) => (
                <tr key={`${t.at}-${t.id}`}>
                  <td>{istWhen(t.at)}</td>
                  <td>{t.id}</td>
                  <td>{t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
      <section className="rp-card">
        <h2>Intensity and emissions</h2>
        <p>
          {perBedYear !== null
            ? `${num(perBedYear)} kWh per bed a year at this month's rate`
            : 'Per-bed intensity needs metered days'}
          {d.site.benchmarks
            ? ` (benchmark ${num(d.site.benchmarks.kwh_per_bed_year.low)} to ${num(d.site.benchmarks.kwh_per_bed_year.high)})`
            : ''}
          .
          {co2 !== null
            ? ` Grid CO₂ ${num(co2, 1)} t; solar avoided ${num((d.totals.solarKwh / 1000) * (d.site.gridFactor ?? 0), 1)} t.`
            : ''}
        </p>
        {d.site.benchmarks ? <p className="rp-note">Benchmark source: {d.site.benchmarks.source}.</p> : null}
      </section>
      <section className="rp-card">
        <h2>Opportunities</h2>
        <table>
          <tbody>
            {d.opportunities.map((o) => (
              <tr key={o.id}>
                <td>{o.title}</td>
                <td>{o.status}</td>
                <td className="n">
                  {o.valueInr ? inr(o.valueInr) : o.valueInrPerMonth ? `${inr(o.valueInrPerMonth)} a month` : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Foot generated={generated} />
    </>
  );
}

export function WeeklyReport({ d, generated }: { d: Awaited<ReturnType<typeof weeklyData>>; generated: string }) {
  const refused = d.commands.filter((c) => c.result === 'refused');
  return (
    <>
      <Cover
        eyebrow="Weekly duty report"
        title={`${d.site.name} · week to ${istWhen(d.to)}`}
        sub="For the duty engineers and the facility manager."
        simulated={d.simulated}
      />
      <div className="rp-kpis">
        <Kpi v={num(d.ceiling.filter((c) => c.kind === 'shed').length)} l="loads held by the ceiling" />
        <Kpi v={num(d.trips.filter((t) => t.state === 'tripped').length)} l="interlock trips" />
        <Kpi v={num(d.events.length)} l="DR events" />
        <Kpi v={num(refused.length)} l="commands refused" />
      </div>
      <section className="rp-card">
        <h2>Ceiling actions</h2>
        {d.ceiling.length ? (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Stage</th>
                <th>Action</th>
                <th>Load</th>
                <th className="n">Projected kVA</th>
              </tr>
            </thead>
            <tbody>
              {d.ceiling.map((c) => (
                <tr key={c.id}>
                  <td>{istWhen(c.at)}</td>
                  <td>{c.stage}</td>
                  <td>{c.kind}</td>
                  <td>{c.assetId ?? '–'}</td>
                  <td className="n">{num(c.projectedKva)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rp-note">The ceiling did not act this week (Stage 1 at {d.ladder.stage1} kVA).</p>
        )}
      </section>
      <section className="rp-card">
        <h2>Interlocks</h2>
        {d.trips.length ? (
          <table>
            <tbody>
              {d.trips.map((t) => (
                <tr key={t.id}>
                  <td>{istWhen(t.at)}</td>
                  <td>{t.interlockId}</td>
                  <td>{t.state}</td>
                  <td>{t.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rp-note">No interlock changes.</p>
        )}
      </section>
      <section className="rp-card">
        <h2>Commands and approvals</h2>
        <table>
          <tbody>
            {[
              ...d.commands.map((c) => ({
                k: c.id,
                at: c.sentAt.toISOString(),
                t: `${c.action} ${c.assetId} (${c.reason})`,
                r: c.result + (c.detail ? `: ${c.detail}` : ''),
              })),
              ...d.audit.map((a) => ({
                k: `a${a.id}`,
                at: a.at.toISOString(),
                t: `${a.action.replaceAll('_', ' ')} ${a.entity} ${a.entityId ?? ''}`,
                r: a.actor,
              })),
            ]
              .sort((a, b) => a.at.localeCompare(b.at))
              .slice(-60)
              .map((x) => (
                <tr key={x.k}>
                  <td>{istWhen(x.at)}</td>
                  <td>{x.t}</td>
                  <td>{x.r}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>
      <Foot generated={generated} />
    </>
  );
}

export function EventReport({ d, generated }: { d: Awaited<ReturnType<typeof eventData>>; generated: string }) {
  const e = d.event;
  if (!e) return <p>Event not found.</p>;
  const s = d.settlement?.stored ?? null;
  const base = (s?.baseline ?? null) as {
    kw: number[];
    factor: number | null;
    eligibleDays: string[];
    blocks: number[];
  } | null;
  const act = (s?.actual ?? null) as {
    kw: number[];
    peakWithKva: number;
    peakWithoutKva: number;
    monthMdBeforeKva: number;
  } | null;
  return (
    <>
      <Cover
        eyebrow="DR event performance"
        title={`${d.site.name} · event ${istWhen(e.start)} to ${istWhen(e.end).split(' · ')[1]}`}
        sub={`Target ${num(e.targetKw)} kW · status ${e.status}.`}
        simulated={d.simulated}
      />
      {s && base && act ? (
        <>
          <div className="rp-kpis">
            <Kpi v={`${num(s.deliveredKw, 1)} kW`} l="delivered on average" />
            <Kpi v={`${num(s.performancePct)}%`} l="of the nomination" />
            <Kpi v={inr(s.valueInr)} l="value" />
            <Kpi v={`${num(s.avoidedTco2, 3)} t`} l="CO₂ avoided" />
          </div>
          <section className="rp-card">
            <h2>Baseline and metered demand over the event</h2>
            <LineChart
              yLabel="Grid kW per 15-minute block"
              series={[
                { label: 'Baseline', color: '#10231a', values: base.kw, dash: '5 4' },
                { label: 'Metered', color: '#1f7a3c', values: act.kw },
              ]}
              xLabels={base.blocks.map(
                (b) =>
                  `${String(Math.floor((b - 1) / 4)).padStart(2, '0')}:${String(((b - 1) % 4) * 15).padStart(2, '0')}`,
              )}
            />
            <p className="rp-note">
              Method {s.method.replaceAll('_', ' ')}
              {base.factor !== null ? `, same-day adjustment ×${num(base.factor, 3)}` : ''}, from{' '}
              {base.eligibleDays.length} eligible like days ({base.eligibleDays.slice(-3).join(', ')}…). Delivered
              energy {num(s.deliveredKwh, 1)} kWh.
            </p>
          </section>
          <section className="rp-card">
            <h2>Value</h2>
            <table>
              <tbody>
                <tr>
                  <td>Day's peak without the event (baseline in the window)</td>
                  <td className="n">{num(act.peakWithoutKva)} kVA</td>
                </tr>
                <tr>
                  <td>Day's peak with the event</td>
                  <td className="n">{num(act.peakWithKva)} kVA</td>
                </tr>
                <tr>
                  <td>Month's peak before this day</td>
                  <td className="n">{num(act.monthMdBeforeKva)} kVA</td>
                </tr>
                <tr>
                  <td>
                    <b>Settled value</b> (avoided demand charge + programme payment − shortfall; shifted energy earns
                    nothing on a flat kVAh rate)
                  </td>
                  <td className="n">
                    <b>{inr(s.valueInr)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <section className="rp-card">
          <h2>Not settled yet</h2>
          <p>{d.settlement?.why ?? 'Settlement runs after the event ends and its blocks are metered.'}</p>
        </section>
      )}
      <section className="rp-card">
        <h2>Approvals and log</h2>
        <table>
          <tbody>
            {e.log.map((l) => (
              <tr key={`${l.at}-${l.kind}`}>
                <td>{istWhen(l.at)}</td>
                <td>{l.kind.replaceAll('_', ' ')}</td>
                <td>
                  {String(
                    (l.detail as { message?: string; by?: string })?.message ?? (l.detail as { by?: string })?.by ?? '',
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Foot generated={generated} />
    </>
  );
}

export function BillAuditReport({ d, generated }: { d: Awaited<ReturnType<typeof billAuditData>>; generated: string }) {
  const flagged = d.bills.bills.filter((b) => b.audit && b.audit.excessKvah > 0);
  return (
    <>
      <Cover
        eyebrow="Bill audit note for MVVNL"
        title={`${d.site.name} · bills on file`}
        sub={`Normal use taken from the ${d.bills.normalFrom ?? '–'} bill: ${num(d.bills.normalKvahPerDay ?? Number.NaN)} kVAh a day.`}
        simulated={false}
      />
      <section className="rp-card">
        <h2>Bills and the engine's recomputation</h2>
        <table>
          <thead>
            <tr>
              <th>Bill</th>
              <th className="n">Days</th>
              <th className="n">kVAh</th>
              <th className="n">kVAh a day</th>
              <th className="n">Billed kVA</th>
              <th className="n">Billed ₹</th>
              <th className="n">Engine ₹</th>
            </tr>
          </thead>
          <tbody>
            {d.bills.bills.map((b) => (
              <tr key={b.id}>
                <td>{b.label}</td>
                <td className="n">{b.days}</td>
                <td className="n">{num(b.kvah)}</td>
                <td className="n">{num(b.kvah / b.days)}</td>
                <td className="n">{num(b.billedKva)}</td>
                <td className="n">{inr(b.total)}</td>
                <td className="n">{b.recomputed ? inr(b.recomputed.total) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {flagged.map((b) => (
        <section className="rp-card" key={`f-${b.id}`}>
          <h2>{b.label}: energy looks over-billed</h2>
          <p>
            {num(b.kvah / b.days)} kVAh a day for {b.days} days, {num(b.audit!.ratio, 1)} times normal.{' '}
            {num(b.audit!.excessKvah)} kVAh above normal use, worth {inr(b.audit!.excessInr)} at the energy rate before
            duty.
          </p>
          {b.note ? <p className="rp-note">Bill note: {b.note}</p> : null}
          <p className="rp-note">
            Request: meter test and reading history for the period, and revision of the energy charge to measured use.
          </p>
        </section>
      ))}
      <Foot generated={generated} />
    </>
  );
}
