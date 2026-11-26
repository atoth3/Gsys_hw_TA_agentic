import { test, expect, type Page } from '@playwright/test';
import { Guru99HomePage } from '../pages/Guru99HomePage';
import { SeleniumTutorialPage } from '../pages/SeleniumTutorialPage';

test('Case 4: iFrame and tab handling', async ({ page }) => {
  const homePage = new Guru99HomePage(page);
  let newTab!: Page;

  await test.step('4.1 open http://demo.guru99.com/test/guru99home', async () => {
    await homePage.open();
    await expect(page).toHaveTitle('Demo Guru99 Page');
  });

  await test.step('4.2 click the image inside the iframe above Email Submission', async () => {
    newTab = await homePage.clickBannerImageAndWaitForNewTab();
  });

  await test.step('4.3 verify the new tab title (amended, D-4.3)', async () => {
    await expect(newTab).toHaveTitle('Selenium Live Project for Practice');
  });

  await test.step('4.4 close the new tab and switch back to the main window', async () => {
    await newTab.close();
  });

  await test.step('4.5 hover Testing and click Selenium in its drop-down', async () => {
    await homePage.openSeleniumTutorialViaTestingMenu();
  });

  const seleniumPage = new SeleniumTutorialPage(page);
  await test.step('4.6 verify the Subscribe for Free button is displayed (amended, D-4.6)', async () => {
    await seleniumPage.subscribeButton.scrollIntoViewIfNeeded();
    await expect(seleniumPage.subscribeButton).toBeVisible();
  });
});
