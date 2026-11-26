import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

test('Case 0: browser install smoke test opens Swag Labs and sees visible content', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.open();

  await expect(loginPage.branding).toBeVisible();
});
