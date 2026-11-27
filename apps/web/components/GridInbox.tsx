'use client';
import { useState } from 'react';
import { Card } from '@/components/ui';
import { istWhen, num } from '@/lib/format';
import { postJson, useMe } from '@/lib/useMe';
import { usePoll } from '@/lib/usePoll';

interface Signal {
  id: number;
  source: string;
  externalId: string;
  receivedAt: string;
  start: string | null;
  end: string | null;
  targetKw: number | null;
  eventId: string | null;
  status: string;
  note: string | null;
}

/** DISCOM inbox: OpenADR events, pasted notices and manual entries. Each becomes a proposed event for approval. */
export function GridInbox({ onEvent }: { onEvent: (id: string) => void }) {
  const me = useMe();
  const [n, setN] = useState(0);
  const r = usePoll<{ signals: Signal[]; openadr: boolean }>(`/api/grid/signals?n=${n}`, 30000);
  const [email, setEmail] = useState('');
  const [m, setM] = useState({ date: '', start: '18:00', end: '20:00', kw: 60, ref: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const can = me && ['facility_manager', 'duty_engineer', 'joulewise_ops'].includes(me.role);
  const done = (res: { ok: boolean; error?: string; status?: unknown; eventId?: unknown; note?: unknown }) => {
    setMsg(
      res.ok
        ? `${String(res.status)}${res.eventId ? ` · event ${String(res.eventId)}` : ''}${res.note ? ` · ${String(res.note)}` : ''}`
        : (res.error ?? 'failed'),
    );
    setN((x) => x + 1);
    if (res.ok && typeof res.eventId === 'string') onEvent(res.eventId);
  };
  return (
    <Card
      title="Grid signals"
      aside={
        <span className="note">
          OpenADR {r.data?.openadr ? 'on' : 'off'} · every signal still needs the approval chain
        </span>
      }
    >
      {can ? (
        <div className="grid-2">
          <div className="stack">
            <div className="ttl-s">Paste a DISCOM notice</div>
            <textarea
              rows={3}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="DISCOM notice text"
              placeholder="…reduce 60 kW on 28/11/2026 from 18:00 to 20:00 hrs. Ref: MVVNL/DR/2026/14"
            />
            <div className="row">
              <button
                type="button"
                className="btn btn-glass"
                disabled={email.length < 10}
                onClick={async () => done(await postJson('/api/grid/signals', { email }))}
              >
                Read notice
              </button>
              {r.data?.openadr ? (
                <button
                  type="button"
                  className="btn btn-glass"
                  onClick={async () => done({ ...(await postJson('/api/grid/poll', {})), status: 'polled' })}
                >
                  Poll VTN now
                </button>
              ) : null}
            </div>
          </div>
          <div className="stack">
            <div className="ttl-s">Or enter it by hand</div>
            <div className="row" style={{ gap: 6 }}>
              <input
                type="date"
                aria-label="Date"
                value={m.date}
                onChange={(e) => setM({ ...m, date: e.target.value })}
              />
              <input
                type="time"
                step={900}
                aria-label="From"
                value={m.start}
                onChange={(e) => setM({ ...m, start: e.target.value })}
              />
              <input
                type="time"
                step={900}
                aria-label="To"
                value={m.end}
                onChange={(e) => setM({ ...m, end: e.target.value })}
              />
              <input
                type="number"
                aria-label="kW"
                value={m.kw}
                min={1}
                max={1000}
                onChange={(e) => setM({ ...m, kw: Number(e.target.value) })}
                style={{ width: 80 }}
              />
              <input
                aria-label="Reference"
                placeholder="Notice ref"
                value={m.ref}
                onChange={(e) => setM({ ...m, ref: e.target.value })}
                style={{ width: 150 }}
              />
            </div>
            <button
              type="button"
              className="btn btn-glass"
              disabled={!m.date || m.ref.length < 2}
              onClick={async () =>
                done(
                  await postJson('/api/grid/signals', {
                    start: `${m.date}T${m.start}:00+05:30`,
                    end: `${m.date}T${m.end}:00+05:30`,
                    targetKw: m.kw,
                    reference: m.ref,
                  }),
                )
              }
            >
              Add event
            </button>
          </div>
        </div>
      ) : null}
      {msg ? (
        <div className="note" role="status">
          {msg}
        </div>
      ) : null}
      {r.data?.signals.length ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Received</th>
              <th>Source</th>
              <th>Reference</th>
              <th>Window</th>
              <th>kW</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {r.data.signals.map((s) => (
              <tr key={s.id}>
                <td>{istWhen(s.receivedAt)}</td>
                <td>{s.source}</td>
                <td>{s.externalId}</td>
                <td>{s.start ? `${istWhen(s.start)} – ${istWhen(s.end).split(' · ')[1]}` : '–'}</td>
                <td>{num(s.targetKw)}</td>
                <td title={s.note ?? ''}>
                  {s.eventId ? (
                    <button
                      type="button"
                      className="btn btn-glass"
                      style={{ minHeight: 28, padding: '2px 10px' }}
                      onClick={() => onEvent(s.eventId!)}
                    >
                      {s.status} · open
                    </button>
                  ) : (
                    `${s.status}${s.note ? `: ${s.note}` : ''}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="note">No grid signals received.</div>
      )}
    </Card>
  );
}
