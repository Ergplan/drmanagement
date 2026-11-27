'use client';

/** Download rows as CSV (Excel opens it). Values are quoted; formulas are neutralised. */
export function CsvButton({ rows, name }: { rows: Array<Record<string, unknown>>; name: string }) {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const download = () => {
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const csv = [cols.map(cell).join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      className="btn btn-glass"
      onClick={download}
      disabled={!rows.length}
      style={{ minHeight: 32, padding: '4px 12px' }}
    >
      CSV
    </button>
  );
}
