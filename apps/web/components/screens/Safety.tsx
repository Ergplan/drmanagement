'use client';
import { CsvButton } from '@/components/CsvButton';
import { Card, Kpi, NoData } from '@/components/ui';
import type { ControlResp } from '@/lib/control-types';
import { istWhen, num } from '@/lib/format';
import { usePoll } from '@/lib/usePoll';

const STATE: Record<string, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: '#2e9a55' },
  tripped: { label: 'Tripped', color: '#b3261e' },
  stale: { label: 'Stale', color: '#b4541a' },
};

const BLOCKERS = [
  'Mass-casualty or disaster alert declared',
  'Emergency OT list running past the event start',
  'Fire alarm, or a DG set running on outage',
  'Any interlock or telemetry point stale',
  'Medical superintendent hold, any reason',
];

const RESTORE = [
  'Clinical-adjacent HVAC back to set points at once',
  'AHU fans back to normal',
  'Pumps, then laundry and kitchen, one at a time',
  'EV and admin loads last',
  'The ceiling stays armed throughout, so restoring never creates a new peak',
];

/** Clinical safety: the nine interlocks as the edge sees them now, refusals, and the full approval record. */
export function SafetyScreen() {
  const c = usePoll<ControlResp>('/api/control', 5000);
  if (!c.data)
    return (
      <Card title="Clinical safety">
        {c.error ? <NoData what="control state" why={c.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const ctl = c.data.control;
  const states = ctl?.interlocks ?? {};
  const healthy = Object.values(states).filter((s) => s.state === 'healthy').length;
  const stale = Object.values(states).filter((s) => s.state === 'stale').length;
  const refused = c.data.commands.filter((x) => x.result === 'refused');
  const excluded = c.data.audit.filter((a) => a.action === 'command_refused');
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Interlocks healthy"
          value={ctl ? `${healthy}` : '–'}
          unit={`of ${c.data.interlocks.length}`}
          tone={ctl?.gateHealthy ? 'mint' : 'alert'}
          foot={<span>{ctl ? 'Checked at the edge every 10 s' : 'Edge has not reported control state'}</span>}
        />
        <Kpi
          title="Commands allowed now"
          value={ctl?.gateHealthy ? 'Yes' : 'No'}
          tone={ctl?.gateHealthy ? 'lime' : 'alert'}
          foot={<span>{ctl?.gateHealthy ? 'Gate open' : 'Any trip or stale point blocks every command'}</span>}
        />
        <Kpi
          title="Stale telemetry"
          value={num(stale)}
          unit="interlocks"
          foot={<span>{c.data.edge.online ? `Edge seen ${num(c.data.edge.ageS ?? 0)} s ago` : 'Edge offline'}</span>}
        />
        <Kpi
          title="Refused commands, 7 days"
          value={num(refused.length + excluded.length)}
          foot={<span>{num(excluded.length)} aimed at a clinical asset</span>}
        />
      </div>

      <div className="grid-2">
        <Card title="Interlocks" aside={<span className="note">Any trip aborts an event or a ceiling stage</span>}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Interlock</th>
                <th>Rule</th>
                <th>Now</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {c.data.interlocks.map((i) => {
                const s = states[i.id];
                const st = STATE[s?.state ?? ''];
                return (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{i.limit}</td>
                    <td>{s?.value ?? '–'}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                        <span className="dot" style={{ background: st?.color ?? '#c3cbc5' }} />
                        {st?.label ?? 'No data'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
        <div className="stack">
          <Card title="These block any event">
            <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
              {BLOCKERS.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Card>
          <Card title="Restore sequence" aside={<span className="note">On abort, or at the end of an event</span>}>
            <ol className="stack" style={{ margin: 0, paddingLeft: 18 }}>
              {RESTORE.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ol>
            <div className="note">
              An interlock trip restores every curtailed load in one edge tick, without the cloud.
            </div>
          </Card>
        </div>
      </div>

      <Card
        title="Approval, override and refusal history"
        aside={
          <CsvButton
            name="audit-7-days"
            rows={
              [...c.data.audit, ...c.data.interlockEvents, ...c.data.commands] as unknown as Array<
                Record<string, unknown>
              >
            }
          />
        }
      >
        {c.data.audit.length || c.data.interlockEvents.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>By</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...c.data.audit.map((a) => ({
                  k: `a${a.id}`,
                  at: a.at,
                  what: `${a.action.replaceAll('_', ' ')} · ${a.entity} ${a.entityId ?? ''}`,
                  by: a.actor,
                  detail: a.action === 'command_refused' ? String((a.after as { detail?: string })?.detail ?? '') : '',
                })),
                ...c.data.interlockEvents.map((e) => ({
                  k: `i${e.id}`,
                  at: e.at,
                  what: `Interlock ${e.interlockId} ${e.state}`,
                  by: 'edge',
                  detail: e.value ?? '',
                })),
              ]
                .sort((a, b) => b.at.localeCompare(a.at))
                .slice(0, 30)
                .map((r) => (
                  <tr key={r.k}>
                    <td>{istWhen(r.at)}</td>
                    <td>{r.what}</td>
                    <td>{r.by}</td>
                    <td>{r.detail}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <div className="note">Nothing recorded in the last 7 days.</div>
        )}
      </Card>

      <Card title="Network and authority">
        <div className="grid-3">
          <div>
            <div className="ttl-s">Network</div>
            <div className="note">
              Edge gateway connects outbound only; energy controls are kept separate from clinical systems.
            </div>
          </div>
          <div>
            <div className="ttl-s">Access</div>
            <div className="note">
              Named users with roles; approvals need the facility manager, the medical superintendent for HVAC, and the
              duty engineer to arm.
            </div>
          </div>
          <div>
            <div className="ttl-s">Hospital override</div>
            <div className="note">Any wall switch or BMS command wins over ergOS.</div>
            <a className="note" href="/commissioning">
              Commissioning and point mapping →
            </a>
          </div>
        </div>
      </Card>
    </>
  );
}
