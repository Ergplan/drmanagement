import { expect, test } from '@playwright/test';
import { api, login, USERS } from './helpers';

/** Propose → approve (→ sign) → arm → abort, two days ahead so tonight is untouched. Each step by its own role. */
test('DR approval chain and abort, each by its own role', async ({ page }) => {
  await login(page, USERS.fm);
  const opt = await api<{ dates: string[] }>(page, '/api/optimizer');
  const date = opt.json.dates[2]!;
  const p = await api<{ id: string }>(page, '/api/events', { date, start: '18:00', end: '19:30', targetKw: 40 });
  expect(p.status).toBe(200);
  const id = p.json.id;

  await login(page, USERS.viewer);
  expect((await api(page, `/api/events/${id}`, { decision: 'approve' })).status).toBe(403);

  await login(page, USERS.fm);
  await page.goto(`/dispatch?event=${id}`);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Facility manager approves').locator('..')).toContainText('fm@globe.demo');

  const ev = await api<{ events: Array<{ id: string; plan: { needsMedicalSuperintendent: boolean } }> }>(
    page,
    `/api/events?fresh=${Date.now()}`,
  );
  if (ev.json.events.find((e) => e.id === id)?.plan.needsMedicalSuperintendent) {
    await login(page, USERS.ms);
    await page.goto(`/dispatch?event=${id}`);
    await page.getByRole('button', { name: 'Sign clinical approval' }).click();
  }

  await login(page, USERS.de);
  await page.goto(`/dispatch?event=${id}`);
  await page.getByRole('button', { name: 'Arm' }).click();
  await expect(page.getByText('Armed at the edge').first()).toBeVisible();
  await page.getByRole('button', { name: 'Abort and restore' }).click();
  await expect(page.getByText('Aborted').first()).toBeVisible();
  const log = await api<{ events: Array<{ id: string; status: string; log: Array<{ kind: string }> }> }>(
    page,
    `/api/events?fresh=${Date.now()}`,
  );
  const e = log.json.events.find((x) => x.id === id)!;
  expect(e.status).toBe('aborted');
  expect(e.log.map((l) => l.kind)).toEqual(expect.arrayContaining(['proposed', 'approve', 'arm', 'abort']));
});
