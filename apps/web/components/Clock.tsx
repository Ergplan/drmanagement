'use client';
import { blockIndexIST } from '@drm/domain';
import { useEffect, useState } from 'react';
import { istParts } from '@/lib/time';

/** Date, IST time and settlement block, ticking every 10 s. */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span>&nbsp;</span>;
  const p = istParts(now);
  return (
    <span>
      {p.weekday} {p.day} {p.month} {p.year} · {p.hour}:{p.minute} IST · Block {blockIndexIST(now)} of 96 · Energy
      Orchestration Centre
    </span>
  );
}
