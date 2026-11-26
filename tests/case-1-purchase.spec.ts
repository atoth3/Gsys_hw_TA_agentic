import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { InventoryPage } from '../pages/InventoryPage';
import { CartPage } from '../pages/CartPage';
import { CheckoutPage } from '../pages/CheckoutPage';
import { readCredentials } from '../utils/credentials';

test('Case 1: Automate Purchase Process', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const inventoryPage = new InventoryPage(page);
  const cartPage = new CartPage(page);
  const checkoutPage = new CheckoutPage(page);

  await test.step('1.1 open the inventory URL as an anonymous visitor and land on login', async () => {
    await page.goto('/inventory.html');
  });

  const credentials = readCredentials();

  await test.step('1.4 log in with the parsed credentials', async () => {
    await loginPage.login(credentials.username, credentials.password);
  });

  await test.step('1.5 add Sauce Labs Backpack and Sauce Labs Fleece Jacket to the cart', async () => {
    await inventoryPage.addToCart('Sauce Labs Backpack');
    await inventoryPage.addToCart('Sauce Labs Fleece Jacket');
  });

  await test.step('1.6 validate the cart badge shows 2', async () => {
    await expect(inventoryPage.cartBadge).toBeVisible();
    await expect(inventoryPage.cartBadge).toHaveText('2');
  });

  await test.step('1.7 go through the checkout process', async () => {
    await inventoryPage.goToCart();
    await cartPage.checkout();
    await checkoutPage.fillCustomerInformation('Test', 'User', '1234');
    await checkoutPage.continueToOverview();
    await checkoutPage.finish();
  });

  await test.step('1.8 validate the order confirmation message', async () => {
    await expect(checkoutPage.confirmationMessage).toBeVisible();
  });
});
