'use client';
import { useState } from 'react';
import { postJson } from '@/lib/useMe';
import styles from './Sidebar.module.css';

const SUGGESTED = [
  'Can we stay under 600 kVA this June?',
  'How full is the hot-water store?',
  'Why is the October bill so high?',
];

/** Ask ergOS in the menu: read-only answers from the site's data, each figure tagged with its screen. */
export function AskBox() {
  const [q, setQ] = useState('');
  const [a, setA] = useState<{ q: string; text: string; busy: boolean } | null>(null);
  const go = async (question: string) => {
    if (question.trim().length < 3) return;
    setA({ q: question, text: '', busy: true });
    const r = await postJson('/api/ask', { question });
    setA({ q: question, text: r.ok ? String(r.answer) : (r.error ?? 'No answer'), busy: false });
    setQ('');
  };
  return (
    <div className={styles.ask}>
      <div className={styles.askTitle}>Ask ergOS</div>
      {a ? (
        <div
          className={styles.bubble}
          style={{ borderRadius: '22px 22px 6px 22px', alignSelf: 'stretch' }}
          aria-live="polite"
        >
          <b>{a.q}</b>
          <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{a.busy ? 'Looking at the data…' : a.text}</div>
        </div>
      ) : (
        SUGGESTED.map((s) => (
          <button
            key={s}
            type="button"
            className={styles.bubble}
            onClick={() => go(s)}
            style={{ border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}
          >
            {s}
          </button>
        ))
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void go(q);
        }}
        style={{ display: 'flex', gap: 6, alignSelf: 'stretch' }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about this site"
          aria-label="Ask ergOS a question"
          style={{
            flex: 1,
            minWidth: 0,
            borderRadius: 999,
            border: '1px solid rgba(16,35,26,.15)',
            padding: '8px 12px',
            font: 'inherit',
            fontSize: 13,
          }}
        />
        {a ? (
          <button
            type="button"
            onClick={() => setA(null)}
            aria-label="Clear answer"
            style={{ borderRadius: 999, border: 0, padding: '0 12px', cursor: 'pointer' }}
          >
            ×
          </button>
        ) : null}
      </form>
      <div style={{ fontSize: 11, color: '#2c4a36', paddingLeft: 6 }}>Reads data only; it cannot change anything.</div>
    </div>
  );
}
