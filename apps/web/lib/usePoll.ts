'use client';
import { useEffect, useRef, useState } from 'react';

/** Fetch JSON now and every `ms` (live UI polls every 5 s; locked decision). Keeps the last good value on errors. */
export function usePoll<T>(url: string | null, ms = 5000): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!url) return;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        const j = await r.json();
        if (!alive.current) return;
        if (!r.ok) setError(j?.error ?? `HTTP ${r.status}`);
        else {
          setData(j as T);
          setError(null);
        }
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      } finally {
        if (alive.current) setLoading(false);
        if (ms > 0) timer = setTimeout(run, ms);
      }
    };
    void run();
    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, [url, ms]);
  return { data, error, loading };
}
