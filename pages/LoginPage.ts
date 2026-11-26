import type { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly branding: Locator;

  constructor(page: Page) {
    this.page = page;
    this.branding = page.getByText('Swag Labs');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
  }
}
