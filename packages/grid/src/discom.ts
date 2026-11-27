/**
 * DISCOM event notices by email (stub parser). MVVNL/UPPCL notices are free text; this reads the common shape
 * "… on 28/11/2026 from 18:00 to 20:00 … reduce 60 kW … Ref: MVVNL/DR/2026/14". Anything it cannot read in full
 * returns null so a person enters it by hand; it never guesses a window.
 */
import type { GridSignal } from './ven';

const IST = '+05:30';

export function parseDiscomEmail(text: string): GridSignal | null {
  const t = text.replace(/\s+/g, ' ');
  const date = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
  const time = /(?:from|between)\s+(\d{1,2})[:.](\d{2})\s*(?:hrs?|h)?\s*(?:to|and|-|–)\s*(\d{1,2})[:.](\d{2})/i.exec(t);
  const kw = /(\d+(?:\.\d+)?)\s*kw\b/i.exec(t);
  const ref = /ref(?:erence)?\.?\s*(?:no\.?)?\s*[:#]?\s*([A-Z0-9/_-]{4,})/i.exec(t);
  if (!date || !time) return null;
  const [, d, m, y] = date;
  const day = `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  const at = (h: string, mi: string) => new Date(`${day}T${h.padStart(2, '0')}:${mi}:00${IST}`);
  const start = at(time[1]!, time[2]!);
  const end = at(time[3]!, time[4]!);
  if (!(end > start) || Number.isNaN(start.getTime())) return null;
  return {
    source: 'discom_email',
    externalId: ref?.[1] ?? `${day}T${time[1]}:${time[2]}`,
    start,
    end,
    targetKw: kw ? Number(kw[1]) : null,
    importLimitKw: null,
    program: 'discom',
    raw: { text: text.slice(0, 2000) },
  };
}
