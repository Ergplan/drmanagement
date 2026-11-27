import { expect, test } from '@playwright/test';
import { login, USERS } from './helpers';

const SCREENS = [
  '/',
  '/live',
  '/ceiling',
  '/forecast',
  '/flexibility',
  '/optimizer',
  '/dispatch',
  '/thermal',
  '/solar',
  '/tariff',
  '/safety',
  '/reports',
];

for (const [role, email] of Object.entries(USERS)) {
  test(`${role} signs in and sees the Simulated data badge`, async ({ page }) => {
    await login(page, email);
    await expect(page.getByText('Simulated data').first()).toBeVisible({ timeout: 15_000 });
  });
}

test('all 12 screens load without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, USERS.fm);
  for (const s of SCREENS) {
    await page.goto(s);
    await expect(page.locator('main h1, main [class*="heading"], main').first()).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByText(/server error|sign in required/i)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
