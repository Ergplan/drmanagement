'use client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Card, Kpi, NoData } from '@/components/ui';
import type { ControlResp } from '@/lib/control-types';
import { istTime, istWhen, num } from '@/lib/format';
import { postJson, useMe } from '@/lib/useMe';
import { usePoll } from '@/lib/usePoll';

interface Ev {
  id: string;
  start: string;
  end: string;
  targetKw: number;
  status: string;
  plan: {
    actions: Array<{ assetId: string; action: string; expectKw: number }>;
    precondition: { leadMin: number; actions: Array<{ assetId: string }> } | null;
    expectedKw: number;
    needsMedicalSuperintendent: boolean;
  };
  forecastPeakKva: number | null;
  plannedPeakKva: number | null;
  createdBy: string;
  armDeadline: string;
  armBy: string;
  approvals: Array<{ role: string; userId: string; decision: string; note: string | null; at: string }>;
  log: Array<{ at: string; kind: string; detail: { message?: string; by?: string } }>;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  proposed: { label: 'Waiting for facility manager', cls: 'pill pill-warn' },
  approved: { label: 'Approved', cls: 'pill pill-warn' },
  signed: { label: 'Signed', cls: 'pill pill-warn' },
  armed: { label: 'Armed at the edge', cls: 'pill pill-ok' },
  running: { label: 'Running', cls: 'pill pill-ok' },
  completed: { label: 'Completed', cls: 'pill' },
  aborted: { label: 'Aborted', cls: 'pill pill-bad' },
  lapsed: { label: 'Lapsed', cls: 'pill pill-bad' },
  rejected: { label: 'Rejected', cls: 'pill pill-bad' },
};

/** Which buttons a role sees for an event in a given status (the server checks again). */
function actionsFor(role: string, e: Ev): Array<{ d: string; label: string; tone: string }> {
  const out: Array<{ d: string; label: string; tone: string }> = [];
  if (e.status === 'proposed' && role === 'facility_manager')
    out.push({ d: 'approve', label: 'Approve', tone: 'btn-green' });
  if (e.status === 'approved' && e.plan.needsMedicalSuperintendent && role === 'medical_superintendent')
    out.push({ d: 'sign', label: 'Sign clinical approval', tone: 'btn-green' });
  if (
    ((e.status === 'approved' && !e.plan.needsMedicalSuperintendent) || e.status === 'signed') &&
    role === 'duty_engineer'
  )
    out.push({ d: 'arm', label: 'Arm', tone: 'btn-dark' });
  if (
    ['proposed', 'approved', 'signed'].includes(e.status) &&
    ['facility_manager', 'medical_superintendent', 'duty_engineer'].includes(role)
  )
    out.push({ d: 'reject', label: 'Reject', tone: 'btn-glass' });
  if (
    ['armed', 'running'].includes(e.status) &&
    ['duty_engineer', 'facility_manager', 'medical_superintendent'].includes(role)
  )
    out.push({ d: 'abort', label: 'Abort and restore', tone: 'btn-dark' });
  return out;
}

export function DispatchScreen() {
  const params = useSearchParams();
  const me = useMe();
  const [nonce, setNonce] = useState(0);
  const ev = usePoll<{ events: Ev[] }>(`/api/events?n=${nonce}`, 10000);
  const ctl = usePoll<ControlResp>('/api/control', 5000);
  const [sel, setSel] = useState<string | null>(params.get('event'));
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!ev.data)
    return (
      <Card title="Dispatch plan">
        {ev.error ? <NoData what="events" why={ev.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const events = ev.data.events;
  const e =
    events.find((x) => x.id === sel) ??
    events.find((x) => ['proposed', 'approved', 'signed', 'armed', 'running'].includes(x.status)) ??
    events[0] ??
    null;
  const edgeIntent = e ? ctl.data?.control?.intents.find((i) => i.eventId === e.id) : undefined;
  const cmds = e ? (ctl.data?.commands ?? []).filter((c) => c.intentId?.includes(e.id)) : [];
  const decide = async (d: string) => {
    if (!e) return;
    setMsg(null);
    const r = await postJson(`/api/events/${e.id}`, { decision: d, note: note || null });
    if (!r.ok) setMsg(r.error ?? 'failed');
    setNote('');
    setNonce((n) => n + 1);
  };
  if (!e)
    return (
      <Card title="Dispatch plan">
        <div className="note">No DR events yet. Build one in the DR optimizer and send it for approval.</div>
      </Card>
    );
  const st = STATUS[e.status] ?? { label: e.status, cls: 'pill' };
  const buttons = me ? actionsFor(me.role, e) : [];
  return (
    <>
      <Card title="Tonight in one line" aside={<span className={st.cls}>{st.label}</span>}>
        <div className="num-s" style={{ fontWeight: 600 }}>
          {e.plan.precondition ? 'Pre-charge the hot-water store, then hold' : 'Hold'} back {num(e.plan.expectedKw)} kW
          of non-clinical load from {istTime(e.start)} to {istTime(e.end)}, so the peak lands at{' '}
          {num(e.plannedPeakKva ?? Number.NaN)} kVA instead of {num(e.forecastPeakKva ?? Number.NaN)}.
        </div>
      </Card>
      <div className="grid-k">
        <Kpi
          title="Held back"
          value={num(e.plan.expectedKw)}
          unit="kW"
          tone="lime"
          foot={<span>target {num(e.targetKw)} kW</span>}
        />
        <Kpi
          title="Peak after"
          value={num(e.plannedPeakKva ?? Number.NaN)}
          unit="kVA"
          foot={<span>forecast {num(e.forecastPeakKva ?? Number.NaN)} kVA</span>}
        />
        <Kpi title="Clinical loads" value="0" unit="touched" tone="mint" />
        <Kpi
          title="At the edge"
          value={edgeIntent ? edgeIntent.phase : ['armed', 'running'].includes(e.status) ? 'Queued' : '–'}
          foot={
            <span>
              {ctl.data?.edge.online ? 'Edge online' : 'Edge offline: an armed event still runs from its local copy'}
            </span>
          }
        />
      </div>
      <div className="grid-2">
        <Card
          title="Approval chain"
          aside={
            <span className="note">
              Arm by {e.armBy} · {istWhen(e.armDeadline)}
            </span>
          }
        >
          <table className="tbl">
            <tbody>
              <tr>
                <td>Proposed</td>
                <td>{e.createdBy}</td>
                <td>Done</td>
              </tr>
              {[
                ['approve', 'Facility manager approves'],
                [
                  'sign',
                  e.plan.needsMedicalSuperintendent
                    ? 'Medical superintendent signs'
                    : 'Medical superintendent · not needed',
                ],
                ['arm', 'Duty engineer arms'],
              ].map(([d, label]) => {
                const a = e.approvals.find((x) => x.decision === d);
                return (
                  <tr key={d}>
                    <td>{label}</td>
                    <td>{a?.userId ?? '–'}</td>
                    <td>{a ? istWhen(a.at) : d === 'sign' && !e.plan.needsMedicalSuperintendent ? '–' : 'Waiting'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {buttons.length ? (
            <div className="stack">
              <input
                placeholder="Note (optional)"
                value={note}
                onChange={(x) => setNote(x.target.value)}
                aria-label="Note for this decision"
              />
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {buttons.map((b) => (
                  <button key={b.d} type="button" className={`btn ${b.tone}`} onClick={() => decide(b.d)}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="note">
              {me ? `Signed in as ${me.role.replaceAll('_', ' ')}: no step for this role now.` : ''}
            </div>
          )}
          {msg ? (
            <div className="note" role="alert">
              {msg}
            </div>
          ) : null}
        </Card>
        <Card
          title="Sequence of commands"
          aside={<span className="note">Each step waits for its interlocks · any trip aborts and restores</span>}
        >
          <ol className="stack" style={{ margin: 0, paddingLeft: 18 }}>
            {e.plan.precondition ? (
              <li>
                {istTime(new Date(Date.parse(e.start) - e.plan.precondition.leadMin * 60000))} · pre-condition:{' '}
                {e.plan.precondition.actions.map((a) => a.assetId).join(', ')}
              </li>
            ) : null}
            <li>
              {istTime(e.start)} · event: hold{' '}
              {e.plan.actions.map((a) => `${a.assetId} (${num(a.expectKw)} kW)`).join(', ')}
            </li>
            <li>{istTime(e.end)} · restore one load at a time, only below Stage 1</li>
            <li>Recovery: watch the rebound for an hour</li>
          </ol>
          {cmds.length ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Load</th>
                  <th>Action</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {cmds.map((c) => (
                  <tr key={c.id}>
                    <td>{istTime(c.sentAt)}</td>
                    <td>{c.assetId}</td>
                    <td>{c.action}</td>
                    <td title={c.detail ?? ''}>{c.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      </div>
      <div className="grid-2">
        <Card title="Event log">
          <table className="tbl">
            <tbody>
              {e.log
                .slice()
                .reverse()
                .map((l) => (
                  <tr key={`${l.at}-${l.kind}`}>
                    <td>{istWhen(l.at)}</td>
                    <td>{l.kind.replaceAll('_', ' ')}</td>
                    <td>{l.detail?.message ?? l.detail?.by ?? ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
        <Card title="All events">
          <table className="tbl">
            <tbody>
              {events.map((x) => (
                <tr
                  key={x.id}
                  onClick={() => setSel(x.id)}
                  style={{ cursor: 'pointer', background: x.id === e.id ? 'rgba(31,122,60,.08)' : undefined }}
                >
                  <td>{istWhen(x.start)}</td>
                  <td>{num(x.targetKw)} kW</td>
                  <td>{STATUS[x.status]?.label ?? x.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
