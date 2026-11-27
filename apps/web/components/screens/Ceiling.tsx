'use client';
import { useMemo } from 'react';
import { StrataChart } from '@/components/StrataChart';
import { Bar, Card, Kpi, NoData } from '@/components/ui';
import { planChart } from '@/lib/charts';
import type { ControlResp } from '@/lib/control-types';
import { istWhen, num } from '@/lib/format';
import { usePoll } from '@/lib/usePoll';

interface Fc {
  today: string;
  blocks: Array<{ date: string; blockNo: number; p50: number }>;
  actual: Array<number | null>;
}

/** Demand ceiling: projected block kVA against the ladder, what is held, and the record of every stage. */
export function CeilingScreen() {
  const c = usePoll<ControlResp>('/api/control', 5000);
  const fc = usePoll<Fc>('/api/forecast', 60000);
  const chart = useMemo(() => {
    if (!fc.data || !c.data) return null;
    const rows = fc.data.blocks
      .filter((b) => b.date === fc.data!.today)
      .map((b) => ({
        date: b.date,
        blockNo: b.blockNo,
        without: b.p50,
        with: null,
        metered: fc.data!.actual[b.blockNo - 1] ?? null,
      }));
    return planChart(rows, c.data.ladder, { title: 'Today · 15-minute grid kVA against the ladder' });
  }, [fc.data, c.data]);
  if (!c.data)
    return (
      <Card title="Demand ceiling">
        {c.error ? <NoData what="control state" why={c.error} /> : <div className="note">Loading…</div>}
      </Card>
    );
  const { ladder, rules, control, live } = c.data;
  const proj = live?.projectedKva ?? null;
  const stage = c.data.ceiling?.stage ?? 0;
  const held = (control?.active ?? []).filter((a) => a.reason === 'ceiling');
  const pct = proj === null ? 0 : (proj / ladder.sanction) * 100;
  const tone = proj === null ? undefined : proj >= ladder.stage1 ? 'alert' : 'mint';
  return (
    <>
      <div className="grid-k">
        <Kpi
          title="Projected this block"
          value={proj === null ? '–' : num(proj)}
          unit="kVA"
          tone={tone}
          foot={
            <span>
              {live?.blockNo
                ? `Block ${live.blockNo} · ${num(live.blockElapsedMin ?? 0, 1)} of 15 min elapsed`
                : 'No live block'}
            </span>
          }
        />
        <Kpi
          title="Ceiling"
          value={num(ladder.ceiling)}
          unit="kVA"
          foot={
            <span>
              {num(ladder.sanction - ladder.ceiling)} kVA reserve under the {num(ladder.sanction)} kVA sanction
            </span>
          }
        />
        <Kpi
          title="Stage now"
          value={stage ? `Stage ${stage}` : 'Armed'}
          tone={stage ? 'alert' : 'lime'}
          foot={
            <span>
              {c.data.ceiling?.armed === false
                ? 'Disarmed'
                : `Loop runs at the edge every 10 s${c.data.edge.online ? '' : ' · edge offline'}`}
            </span>
          }
        />
        <Kpi
          title="Loads held by the ceiling"
          value={num(held.length)}
          foot={<span>{held.map((h) => h.assetId).join(', ') || 'None'}</span>}
        />
      </div>

      <Card
        title="Where this block is heading"
        aside={
          <span className="pill">
            {proj === null
              ? 'No data'
              : proj >= ladder.ceiling
                ? 'At the ceiling'
                : proj >= ladder.stage1
                  ? 'Above Stage 1'
                  : 'Under Stage 1'}
          </span>
        }
      >
        <Bar
          pct={pct}
          color={proj !== null && proj >= ladder.stage1 ? '#b4541a' : '#1f7a3c'}
          label="Projected block kVA as a share of sanction"
        />
        <div className="between note">
          <span>0</span>
          <span>Stage 1 {num(ladder.stage1)}</span>
          <span>Stage 2 {num(ladder.stage2)}</span>
          <span>Stage 3 {num(ladder.stage3)}</span>
          <span>Ceiling {num(ladder.ceiling)}</span>
          <span>Sanction {num(ladder.sanction)}</span>
        </div>
      </Card>

      <Card
        title="Shed ladder"
        aside={<span className="note">Triggered on projected interval demand · least clinical impact first</span>}
      >
        {rules ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Trigger</th>
                <th>Action</th>
                <th>Sheds</th>
                <th>Within</th>
                <th>Restores</th>
              </tr>
            </thead>
            <tbody>
              {rules.stages.map((s) => (
                <tr key={s.stage} style={stage >= s.stage ? { background: 'rgba(180,84,26,.10)' } : undefined}>
                  <td>
                    <b>Stage {s.stage}</b>
                  </td>
                  <td>Projected over {num(s.trigger_projected_kva)} kVA</td>
                  <td>{[...(s.shed ?? []).map((x) => `Hold ${x}`), ...(s.actions ?? [])].join(' · ')}</td>
                  <td>{num(s.expect_kw)} kW</td>
                  <td>{s.response}</td>
                  <td>{s.restore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <NoData what="ceiling rules" why="seed not run" />
        )}
        <div className="note">
          Restores wait until the projection is below Stage 1, one load every {rules?.restore_step_minutes ?? '–'}{' '}
          minutes, so bringing loads back never makes a new peak.
        </div>
      </Card>

      <Card title="Today against the ladder" pad="pad-l">
        {chart ? (
          <StrataChart options={chart} minHeight={300} label="Today's grid kVA against the ceiling ladder" />
        ) : (
          <NoData what="forecast" why={fc.error} />
        )}
      </Card>

      <Card title="Ceiling actions, last 7 days">
        {c.data.ceilingActions.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>When</th>
                <th>Stage</th>
                <th>Action</th>
                <th>Load</th>
                <th>Projected</th>
              </tr>
            </thead>
            <tbody>
              {c.data.ceilingActions.slice(0, 20).map((a) => (
                <tr key={a.id}>
                  <td>{istWhen(a.at)}</td>
                  <td>{a.stage}</td>
                  <td>{a.kind === 'page' ? 'Paged duty engineer' : a.kind === 'shed' ? 'Held' : 'Restored'}</td>
                  <td>{a.assetId ?? '–'}</td>
                  <td>{num(a.projectedKva)} kVA</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="note">No ceiling stage in the last 7 days.</div>
        )}
      </Card>
    </>
  );
}
