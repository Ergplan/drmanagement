'use client';
import { usePoll } from './usePoll';

export interface Me {
  id: string;
  name: string;
  role: string;
}
export const useMe = () => usePoll<Me>('/api/me', 0).data;

export async function postJson(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, ...j } : { ok: false, error: j?.error ?? `HTTP ${r.status}` };
}
