import { expect, test } from '@playwright/test';
import { login, USERS } from './helpers';

test('Street View loads, moves to three stops, panel shows live values', async ({ page }) => {
  await login(page, USERS.fm);
  const t0 = Date.now();
  await page.goto('/street?node=ht-meter');
  await expect(page.locator('canvas')).toBeVisible({ timeout: 20_000 });
  console.log(`street canvas visible in ${Date.now() - t0} ms`);
  for (const stop of ['Chiller plant', 'ICU and NICU', 'Rooftop solar']) {
    await page
      .getByRole('navigation', { name: 'Floors and stops' })
      .getByRole('button', { name: new RegExp(stop) })
      .click();
    const panel = page.getByRole('complementary', { name: new RegExp(stop) });
    await expect(panel).toBeVisible();
    await expect(panel.locator('.st-fig b').first()).not.toHaveText('–', { timeout: 15_000 });
  }
  await expect(page.locator('.st-strip')).toContainText('Simulated data');
});
