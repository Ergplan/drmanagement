'use client';
import { useState } from 'react';
import { CsvButton } from '@/components/CsvButton';
import { Card, Kpi, NoData } from '@/components/ui';
import { inr, istWhen, num } from '@/lib/format';
import { postJson, useMe } from '@/lib/useMe';
import { usePoll } from '@/lib/usePoll';

interface Mv {
  days: number;
  gridKwh: number;
  solarKwh: number;
  beds: number | null;
  perBedYearKwh: number | null;
  benchmarks: { kwh_per_bed_year: { low: number; high: number }; source: string } | null;
  gridFactor: number | null;
  gridTco2: number | null;
  solarAvoidedTco2: number | null;
  simulated: boolean;
  programme: {
    name: string;
    method: string;
    params: { days?: number; adjust_hours_before?: number; cap?: number };
    noticeMin: number;
  } | null;
  events: Array<{
    id: string;
    start: string;
    end: string;
    status: string;
    targetKw: number;
    settlement: {
      deliveredKw: number;
      deliveredKwh: number;
      performancePct: number;
      valueInr: number;
      avoidedTco2: number;
    } | null;
  }>;
}
interface Opp {
  id: string;
  title: string;
  kind: string;
  status: string;
  valueInr: number | null;
  valueInrPerMonth: number | null;
}
interface Rep {
  id: string;
  kind: string;
  params: { month?: string; eventId?: string; to?: string };
  status: string;
  error: string | null;
  createdAt: string;
  readyAt: string | null;
  requestedBy: string | null;
}

const KIND: Record<string, string> = {
  monthly: 'Monthly performance',
  weekly: 'Weekly duty report',
  event: 'Event report',
  bill_audit: 'Bill audit note for MVVNL',
};
const OPP_STATUS: Record<string, string> = {
  found: 'Found',
  to_approve: 'To approve',
  approved: 'Approved',
  running: 'Live',
  verified: 'Verified',
  dropped: 'Dropped',
};
const OPP_NEXT: Record<string, string[]> = {
  found: ['to_approve', 'dropped'],
  to_approve: ['approved', 'dropped'],
  approved: ['running', 'dropped'],
  running: ['verified', 'dropped'],
  verified: [],
  dropped: ['found'],
};
const METHOD: Record<string, string> = {
  day_matching: 'Day matching',
  x_of_y: 'High X of Y days',
  pre_event: 'Pre-event level',
};

export function ReportsScreen() {
  const me = useMe();
  const [n, setN] = useState(0);
  const mv = usePoll<Mv>(`/api/mv?n=${n}`, 60000);
  const opps = usePoll<{ opportunities: Opp[] }>(`/api/opportunities?n=${n}`, 60000);
  const reps = usePoll<{ reports: Rep[] }>(`/api/reports?n=${n}`, 5000);
  const [month, setMonth] = useState(() => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7));
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (url: string, body: unknown) => {
    setMsg(null);
    const r = await postJson(url, body);
    if (!r.ok) setMsg(r.error ?? 'failed');
    setN((x) => x + 1);
  };
  if (!mv.data)
    return (
      <Card title="Reports & M&V">
        {mv.error ? <NoData what="metered days" why={mv.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const m = mv.data;
  const canOpp = me && ['facility_manager', 'accounts', 'joulewise_ops'].includes(me.role);
  const canReport = me && me.role !== 'viewer';
  const bench = m.benchmarks?.kwh_per_bed_year;
  return (
    <>
      <div className="grid-k">
        <Kpi
          title={`Site energy, last ${m.days} days`}
          value={num((m.gridKwh + m.solarKwh) / 1000, 1)}
          unit="MWh"
          foot={
            <span>
              Grid {num(m.gridKwh / 1000, 1)} · solar {num(m.solarKwh / 1000, 1)}
            </span>
          }
        />
        <Kpi
          title="Per bed a year"
          value={m.perBedYearKwh === null ? '–' : num(m.perBedYearKwh)}
          unit="kWh"
          tone={m.perBedYearKwh !== null && bench && m.perBedYearKwh <= bench.high ? 'mint' : 'alert'}
          foot={
            <span>
              {bench ? `Benchmark ${num(bench.low)} to ${num(bench.high)} · annualised` : 'No benchmark on file'}
            </span>
          }
        />
        <Kpi title="Per m² a year" value="–" foot={<span>Needs the built-up area from the hospital</span>} />
        <Kpi
          title={`Grid CO₂, ${m.days} days`}
          value={m.gridTco2 === null ? '–' : num(m.gridTco2, 1)}
          unit="t"
          foot={
            <span>
              Solar avoided {num(m.solarAvoidedTco2 ?? 0, 1)} t at {num(m.gridFactor ?? 0, 3)} t/MWh
            </span>
          }
        />
      </div>

      <Card
        title="Value found so far"
        aside={
          <CsvButton
            name="opportunities"
            rows={(opps.data?.opportunities ?? []) as unknown as Array<Record<string, unknown>>}
          />
        }
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Item</th>
              <th>Status</th>
              <th>Worth</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(opps.data?.opportunities ?? []).map((o) => (
              <tr key={o.id}>
                <td>{o.title}</td>
                <td>{OPP_STATUS[o.status] ?? o.status}</td>
                <td>
                  {o.valueInr
                    ? `${inr(o.valueInr)} once`
                    : o.valueInrPerMonth
                      ? `${inr(o.valueInrPerMonth)} a month`
                      : '–'}
                </td>
                <td>
                  {canOpp
                    ? (OPP_NEXT[o.status] ?? []).map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="btn btn-glass"
                          style={{ minHeight: 30, padding: '2px 10px', marginRight: 6 }}
                          onClick={() => act(`/api/opportunities/${o.id}`, { status: s })}
                        >
                          {OPP_STATUS[s]}
                        </button>
                      ))
                    : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="note">
          Nothing here is verified savings until an M&V settlement or a corrected bill confirms it.
        </div>
      </Card>

      <div className="grid-2">
        <Card title="Measurement and verification">
          {m.programme ? (
            <>
              <div className="kv">
                <span>Programme</span>
                <b>{m.programme.name}</b>
              </div>
              <div className="kv">
                <span>Baseline</span>
                <b>
                  {METHOD[m.programme.method] ?? m.programme.method}: average of the last{' '}
                  {m.programme.params.days ?? '–'} like days, 15-minute, scaled to the{' '}
                  {m.programme.params.adjust_hours_before ?? '–'} hours before the event (before any pre-conditioning),
                  capped at ±{num((m.programme.params.cap ?? 0) * 100)}%
                </b>
              </div>
              <div className="kv">
                <span>Event result</span>
                <b>
                  Delivered kW and kWh against the baseline, performance against the nomination, avoided demand charge
                  from the tariff engine
                </b>
              </div>
              <div className="kv">
                <span>Excluded days</span>
                <b>Other event days, Sundays and holidays (unless the event is on one), days with missing blocks</b>
              </div>
            </>
          ) : (
            <NoData what="programme" />
          )}
        </Card>
        <Card
          title="Events and settlement"
          aside={
            <CsvButton
              name="settlements"
              rows={m.events.map((e) => ({
                id: e.id,
                start: e.start,
                end: e.end,
                status: e.status,
                targetKw: e.targetKw,
                ...(e.settlement ?? {}),
              }))}
            />
          }
        >
          {m.events.length ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Status</th>
                  <th>Delivered</th>
                  <th>Performance</th>
                  <th>Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {m.events.map((e) => (
                  <tr key={e.id}>
                    <td>{istWhen(e.start)}</td>
                    <td>{e.status}</td>
                    <td>{e.settlement ? `${num(e.settlement.deliveredKw, 1)} kW` : '–'}</td>
                    <td>{e.settlement ? `${num(e.settlement.performancePct)}%` : '–'}</td>
                    <td>{e.settlement ? inr(e.settlement.valueInr) : '–'}</td>
                    <td>
                      {canReport && ['completed', 'aborted'].includes(e.status) ? (
                        <button
                          type="button"
                          className="btn btn-glass"
                          style={{ minHeight: 30, padding: '2px 10px' }}
                          onClick={() => act('/api/reports', { kind: 'event', eventId: e.id })}
                        >
                          Report
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="note">No events yet.</div>
          )}
        </Card>
      </div>

      <Card
        title="Reports"
        aside={
          canReport ? (
            <div className="row">
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Report month" />
              <button
                type="button"
                className="btn btn-green"
                onClick={() => act('/api/reports', { kind: 'monthly', month })}
              >
                Monthly
              </button>
              <button type="button" className="btn btn-glass" onClick={() => act('/api/reports', { kind: 'weekly' })}>
                Weekly duty
              </button>
              <button
                type="button"
                className="btn btn-glass"
                onClick={() => act('/api/reports', { kind: 'bill_audit' })}
              >
                Bill audit
              </button>
            </div>
          ) : null
        }
      >
        {msg ? (
          <div className="note" role="alert">
            {msg}
          </div>
        ) : null}
        {reps.data?.reports.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Report</th>
                <th>Covers</th>
                <th>Requested</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reps.data.reports.map((r) => (
                <tr key={r.id}>
                  <td>{KIND[r.kind] ?? r.kind}</td>
                  <td>
                    {r.params.month ??
                      (r.params.eventId
                        ? `Event ${r.params.eventId}`
                        : r.params.to
                          ? `Week to ${istWhen(r.params.to)}`
                          : 'Bills on file')}
                  </td>
                  <td>
                    {istWhen(r.createdAt)} · {r.requestedBy}
                  </td>
                  <td title={r.error ?? ''}>
                    {r.status === 'ready'
                      ? `Ready ${istWhen(r.readyAt)}`
                      : r.status === 'failed'
                        ? `Failed: ${r.error}`
                        : r.status === 'rendering'
                          ? 'Rendering at the edge'
                          : 'Queued for the edge'}
                  </td>
                  <td className="row" style={{ gap: 6 }}>
                    {r.status === 'ready' ? (
                      <a
                        className="btn btn-green"
                        style={{ minHeight: 30, padding: '2px 10px' }}
                        href={`/api/reports/${r.id}/pdf`}
                      >
                        PDF
                      </a>
                    ) : null}
                    <a
                      className="btn btn-glass"
                      style={{ minHeight: 30, padding: '2px 10px' }}
                      href={`/print/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="note">
            No reports yet. The monthly report is queued on the 1st and the weekly duty report on Mondays.
          </div>
        )}
      </Card>
    </>
  );
}
