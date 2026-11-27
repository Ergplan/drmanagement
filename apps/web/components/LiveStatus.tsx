'use client';
import { num } from '@/lib/format';
import { usePoll } from '@/lib/usePoll';

interface LiveMain {
  live: { kva: number; projectedKva: number; source: string; quality: string } | null;
  edge: { online: boolean; ageS: number | null };
  ceiling: { armed: boolean; stage: number } | null;
  simulated: boolean;
}

/** Ceiling pill and provenance badge in the top bar (invariant 6), polled every 5 s. */
export function LiveStatus() {
  const { data, error } = usePoll<LiveMain>('/api/live/main', 5000);
  const live = data?.live;
  const online = data?.edge.online ?? false;
  const stage = data?.ceiling?.stage ?? 0;
  const ceilingKva = 570;
  let cls = 'pill';
  let dot = '#c3cbc5';
  let text = error ? 'No live data' : 'Waiting for edge data';
  if (live && online) {
    const high = live.projectedKva >= 520 || stage > 0;
    cls = high ? 'pill pill-warn' : 'pill pill-ok';
    dot = high ? '#b4541a' : '#2e9a55';
    text =
      stage > 0
        ? `Ceiling · Stage ${stage} · ${num(live.projectedKva)} of ${ceilingKva} kVA`
        : `Under ceiling · ${num(live.kva)} of ${ceilingKva} kVA`;
  } else if (live && !online) {
    cls = 'pill pill-bad';
    dot = '#b3261e';
    text = `Edge offline · last ${num(data?.edge.ageS ?? 0)} s ago`;
  }
  return (
    <>
      {data?.simulated ? (
        <span
          className="pill"
          style={{ minHeight: 44, background: 'rgba(214,204,250,.75)', color: '#44297a', fontWeight: 700 }}
          title="Readings come from the hospital simulator, not site meters"
        >
          Simulated data
        </span>
      ) : null}
      <div className={cls} style={{ minHeight: 44 }} aria-live="polite">
        <span className="dot" style={{ background: dot }} />
        {text}
      </div>
    </>
  );
}
