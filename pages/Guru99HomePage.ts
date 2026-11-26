import type { Page, Locator, FrameLocator } from '@playwright/test';

export class Guru99HomePage {
  readonly page: Page;
  readonly bannerFrame: FrameLocator;
  readonly bannerImage: Locator;
  readonly testingMenuItem: Locator;
  // Several links on the page share this href (the top-menu item itself, plus
  // drop-down/footer entries that reuse it); the top-menu one is always first in
  // the DOM, so `.first()` picks it out.
  readonly seleniumDropdownLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.bannerFrame = page.frameLocator('iframe[src*="ads.html"]');
    this.bannerImage = this.bannerFrame.locator('img');
    this.testingMenuItem = page.locator('a[href="https://www.guru99.com/software-testing.html"]').first();
    this.seleniumDropdownLink = page.locator('a[href="https://www.guru99.com/selenium-tutorial.html"]').first();
  }

  async open(): Promise<void> {
    // The page pulls in slow third-party ad/tracker resources that can take
    // well past the default navigation timeout to finish loading; the test
    // only needs the DOM ready, not every resource, so wait for that instead.
    await this.page.goto('/test/guru99home', { waitUntil: 'domcontentloaded' });
  }

  async clickBannerImageAndWaitForNewTab(): Promise<Page> {
    const [newTab] = await Promise.all([
      this.page.waitForEvent('popup'),
      this.bannerImage.click(),
    ]);
    return newTab;
  }

  async openSeleniumTutorialViaTestingMenu(): Promise<void> {
    await this.testingMenuItem.hover();
    await this.seleniumDropdownLink.click();
  }
}
