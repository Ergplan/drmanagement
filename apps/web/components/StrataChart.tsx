'use client';
import { useEffect, useRef } from 'react';

/**
 * React wrapper around the vendored Strata charts (public/strata-charts.min.js, v1.1.1) with the "eoc" day theme
 * ported from design/canvas/lib/eoc.js.
 */
type StrataBoard = { destroy?: () => void };
type StrataLib = {
  mount: (el: HTMLElement, opt: object) => Promise<StrataBoard> | StrataBoard;
  registerTheme: (t: object) => void;
};
declare global {
  interface Window {
    Strata?: StrataLib;
  }
}

let loading: Promise<StrataLib> | null = null;
let themed = false;

function loadStrata(): Promise<StrataLib> {
  if (window.Strata) return Promise.resolve(window.Strata);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/strata-charts.min.js';
    s.async = true;
    s.onload = () => (window.Strata ? resolve(window.Strata) : reject(new Error('Strata missing')));
    s.onerror = () => reject(new Error('chart library failed to load'));
    document.head.appendChild(s);
  });
  return loading.then((S) => {
    if (!themed) {
      S.registerTheme({
        name: 'eoc',
        extends: 'mono',
        light: {
          panel: '#ffffff',
          raised: '#ffffff',
          ink: '#10231a',
          ink2: '#33443b',
          muted: '#4f5e56',
          faint: '#c3cbc5',
          line: 'rgba(16,35,26,.10)',
          grid: 'rgba(16,35,26,.08)',
          trend: '#10231a',
          handle: '#1f7a3c',
          bar: '#cfd8d1',
          barHover: '#a9b7ad',
          barSelected: '#1f7a3c',
          up: '#1b5a33',
          upBg: '#d6f0dc',
          down: '#8a1f12',
          downBg: '#fbdcd8',
        },
      });
      themed = true;
    }
    return S;
  });
}

export function StrataChart({
  options,
  minHeight = 240,
  label,
}: {
  options: object | null;
  minHeight?: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = options ? JSON.stringify(options, (_k, v) => (typeof v === 'function' ? String(v) : v)) : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: remount only when the serialised options change
  useEffect(() => {
    const el = ref.current;
    if (!el || !options) return;
    let board: StrataBoard | null = null;
    let cancelled = false;
    el.innerHTML = '';
    loadStrata()
      .then(async (S) => {
        const b = await S.mount(el, {
          theme: 'eoc',
          mode: 'light',
          loadFonts: false,
          locale: 'en-IN',
          currency: 'INR',
          futureHatch: false,
          panel: false,
          ...options,
        });
        if (cancelled) b?.destroy?.();
        else board = b;
      })
      .catch(() => {
        if (!cancelled) el.textContent = 'The chart could not be drawn.';
      });
    return () => {
      cancelled = true;
      board?.destroy?.();
    };
  }, [key]);
  return <div ref={ref} role="img" aria-label={label} style={{ minHeight }} />;
}
