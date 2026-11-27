'use client';
import { useState } from 'react';
import { CsvButton } from '@/components/CsvButton';
import { Card, ClassTag, Kpi, NoData } from '@/components/ui';
import { num } from '@/lib/format';
import { postJson, useMe } from '@/lib/useMe';
import { usePoll } from '@/lib/usePoll';

interface Row {
  id: string;
  node: string;
  nodeId: string;
  drClass: string;
  unit: string;
  driverLater: string | null;
  sourceDriver: string;
  deviceRef: string | null;
  value: number | null;
  source: string | null;
  quality: string | null;
  ageS: number | null;
}

const CHECKLIST = [
  'Site survey: confirm each node, its panel and the CT ratios against points.yaml',
  'Install the gateway on the hospital LAN; outbound HTTPS only (no inbound ports)',
  'Probe each device: pnpm edge:probe --driver modbus-tcp --host … --map … (reads only)',
  'Compare probe values with the panel display and the simulator for a day before switching',
  'Add the point overrides below to edge.config.yaml and restart the edge',
  'Check the point here: source shows the device id, quality good, age under its freshness limit',
  'Walk the interlocks: trip each one on purpose and watch every load restore within 60 s',
  'Facility manager and medical superintendent sign the commissioning sheet; only then arm DR',
];

/** Point mapping and commissioning: every point, where it comes from now, and the switch to a real device. */
export function CommissioningScreen() {
  const me = useMe();
  const [n, setN] = useState(0);
  const r = usePoll<{ points: Row[]; yaml: string }>(`/api/commissioning?n=${n}`, 15000);
  const [edit, setEdit] = useState<{ id: string; driver: string; ref: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!r.data)
    return (
      <Card title="Commissioning">
        {r.error ? <NoData what="points" why={r.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const rows = r.data.points;
  const real = rows.filter((x) => x.source && x.source !== 'sim');
  const stale = rows.filter((x) => x.ageS === null || x.ageS > 120);
  const canEdit = me && ['joulewise_ops', 'facility_manager'].includes(me.role);
  const save = async () => {
    if (!edit) return;
    const res = await postJson(`/api/points/${edit.id}/mapping`, {
      sourceDriver: edit.driver,
      deviceRef: edit.ref || null,
    });
    setMsg(
      res.ok ? `Saved. Add the line for ${edit.id} to edge.config.yaml to make it live.` : (res.error ?? 'failed'),
    );
    setEdit(null);
    setN((x) => x + 1);
  };
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Points"
          value={num(rows.length)}
          foot={<span>{num(new Set(rows.map((x) => x.nodeId)).size)} nodes</span>}
        />
        <Kpi
          title="From real devices"
          value={num(real.length)}
          tone={real.length ? 'lime' : undefined}
          foot={<span>The rest come from the simulator</span>}
        />
        <Kpi
          title="Not fresh"
          value={num(stale.length)}
          tone={stale.length ? 'alert' : 'mint'}
          foot={<span>No reading in the last 2 minutes</span>}
        />
        <Kpi
          title="Mapped to a device"
          value={num(rows.filter((x) => x.sourceDriver !== 'sim').length)}
          foot={<span>Waiting for edge.config.yaml</span>}
        />
      </div>
      <div className="grid-2">
        <Card title="Commissioning checklist">
          <ol className="stack" style={{ margin: 0, paddingLeft: 18 }}>
            {CHECKLIST.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        </Card>
        <Card title="edge.config.yaml overrides">
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 14,
              background: 'rgba(16,35,26,.06)',
              overflow: 'auto',
              fontSize: 12.5,
            }}
          >
            {r.data.yaml}
          </pre>
          <div className="note">
            Switching a point to a real meter is this change on the edge, not a code change (invariant 10).
          </div>
          {msg ? (
            <div className="note" role="status">
              {msg}
            </div>
          ) : null}
        </Card>
      </div>
      <Card title="Points" aside={<CsvButton name="points" rows={rows as unknown as Array<Record<string, unknown>>} />}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Point</th>
              <th>Node</th>
              <th>Now</th>
              <th>Source</th>
              <th>Age</th>
              <th>Mapped to</th>
              <th>Driver later</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td>{x.id}</td>
                <td>
                  {x.node} <ClassTag cls={x.drClass} />
                </td>
                <td>
                  {num(x.value, 2)} {x.unit}
                </td>
                <td>{x.source ?? '–'}</td>
                <td>{x.ageS === null ? 'none' : `${num(x.ageS)} s`}</td>
                <td>
                  {edit?.id === x.id ? (
                    <span className="row" style={{ gap: 4 }}>
                      <input
                        aria-label="Driver id"
                        value={edit.driver}
                        onChange={(e) => setEdit({ ...edit, driver: e.target.value })}
                        style={{ width: 110 }}
                      />
                      <input
                        aria-label="Device reference"
                        placeholder="unit/register"
                        value={edit.ref}
                        onChange={(e) => setEdit({ ...edit, ref: e.target.value })}
                        style={{ width: 110 }}
                      />
                    </span>
                  ) : (
                    `${x.sourceDriver}${x.deviceRef ? ` · ${x.deviceRef}` : ''}`
                  )}
                </td>
                <td>{x.driverLater ?? '–'}</td>
                <td>
                  {canEdit ? (
                    edit?.id === x.id ? (
                      <button
                        type="button"
                        className="btn btn-green"
                        style={{ minHeight: 30, padding: '2px 10px' }}
                        onClick={save}
                      >
                        Save
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-glass"
                        style={{ minHeight: 30, padding: '2px 10px' }}
                        onClick={() => setEdit({ id: x.id, driver: x.sourceDriver, ref: x.deviceRef ?? '' })}
                      >
                        Map
                      </button>
                    )
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
