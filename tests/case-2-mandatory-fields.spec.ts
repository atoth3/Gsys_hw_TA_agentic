import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';

test('Case 2: Verify error messages for mandatory fields', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const inventoryPage = new InventoryPage(page);

  await test.step('2.1 open the inventory URL as an anonymous visitor and land on login', async () => {
    await page.goto('/inventory.html');
  });

  await test.step('2.2 click Login with both fields empty', async () => {
    await loginPage.loginButton.click();
  });

  await test.step('2.3 validate the mandatory-field error message', async () => {
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.errorMessage).toHaveText('Epic sadface: Username is required');
  });

  await test.step('2.4 log in with standard_user / secret_sauce', async () => {
    await loginPage.login('standard_user', 'secret_sauce');
    await expect(inventoryPage.cartLink).toBeVisible();
  });

  await test.step('2.5 scroll down to the bottom of the page', async () => {
    await inventoryPage.scrollToBottom();
  });

  await test.step('2.6 validate the footer message contains the copyright year and Terms of Service', async () => {
    const currentYear = String(new Date().getFullYear());
    await expect(inventoryPage.footerCopy).toBeVisible();
    await expect(inventoryPage.footerCopy).toContainText(currentYear);
    await expect(inventoryPage.footerCopy).toContainText('Terms of Service');
  });
});
