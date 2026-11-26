import type { Page, Locator } from '@playwright/test';

export class InventoryPage {
  readonly page: Page;
  readonly cartBadge: Locator;
  readonly cartLink: Locator;
  readonly footerCopy: Locator;

  constructor(page: Page) {
    this.page = page;
    this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
    this.cartLink = page.locator('[data-test="shopping-cart-link"]');
    this.footerCopy = page.locator('[data-test="footer-copy"]');
  }

  async scrollToBottom(): Promise<void> {
    await this.footerCopy.scrollIntoViewIfNeeded();
  }

  async addToCart(productName: string): Promise<void> {
    await this.page
      .locator('[data-test="inventory-item"]')
      .filter({ hasText: productName })
      .getByRole('button', { name: 'Add to cart' })
      .click();
  }

  async goToCart(): Promise<void> {
    await this.cartLink.click();
  }
}
