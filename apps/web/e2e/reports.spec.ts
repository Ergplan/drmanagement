import { expect, test } from '@playwright/test';
import { api, login, USERS } from './helpers';

test('bill audit report renders at the edge and downloads as a PDF', async ({ page }) => {
  await login(page, USERS.accounts);
  const q = await api<{ id: string }>(page, '/api/reports', { kind: 'bill_audit' });
  expect(q.status).toBe(200);
  let status = '';
  for (let i = 0; i < 30 && status !== 'ready' && status !== 'failed'; i++) {
    await page.waitForTimeout(3000);
    const r = await api<{ reports: Array<{ id: string; status: string }> }>(page, '/api/reports');
    status = r.json.reports.find((x) => x.id === q.json.id)?.status ?? '';
  }
  expect(status).toBe('ready');
  const pdf = await page.request.get(`/api/reports/${q.json.id}/pdf`);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
});
