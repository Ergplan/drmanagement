import { expect, type Page } from '@playwright/test';

export const PASSWORD = process.env.E2E_PASSWORD ?? '';
export const USERS = {
  fm: 'fm@globe.demo',
  ms: 'ms@globe.demo',
  de: 'de@globe.demo',
  accounts: 'accounts@globe.demo',
  ops: 'ops@joulewise.demo',
  viewer: 'viewer@globe.demo',
} as const;

export async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await expect(page.getByRole('navigation', { name: 'Energy Orchestration Centre' })).toBeVisible();
}

export async function api<T = unknown>(page: Page, url: string, body?: unknown): Promise<{ status: number; json: T }> {
  return page.evaluate(
    async ([u, b]) => {
      const r = await fetch(
        u as string,
        b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {},
      );
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    [url, body] as const,
  ) as Promise<{ status: number; json: T }>;
}
