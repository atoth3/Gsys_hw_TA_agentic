import type { Page, Locator } from '@playwright/test';

export class SeleniumTutorialPage {
  readonly page: Page;
  readonly subscribeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.subscribeButton = page.getByRole('button', { name: 'Subscribe for Free' });
  }
}
