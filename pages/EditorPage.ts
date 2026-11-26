import type { Page, Locator } from '@playwright/test';

export class EditorPage {
  readonly page: Page;
  readonly editingArea: Locator;
  readonly boldButton: Locator;
  readonly underlineButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.editingArea = page.getByRole('textbox', { name: /Rich Text Editor/ });
    this.boldButton = page.getByRole('button', { name: 'Bold', exact: true });
    this.underlineButton = page.getByRole('button', { name: 'Underline', exact: true });
  }

  async open(): Promise<void> {
    await this.page.goto('/');
  }

  async typeText(text: string): Promise<void> {
    // Click near the top-left of the editing area: the editor's bottom
    // can be covered by the fixed cookie-consent banner.
    await this.editingArea.click({ position: { x: 5, y: 5 } });
    await this.editingArea.pressSequentially(text);
  }

  // Selects `length` characters starting at `start`, counted from the
  // beginning of the editor's (single-line) content. CKEditor doesn't move
  // the caret on a plain `Home` keypress, so the caret is placed at the
  // start of the line with a real click instead.
  async selectRange(start: number, length: number): Promise<void> {
    const box = (await this.editingArea.boundingBox())!;
    await this.page.mouse.click(box.x + 2, box.y + 10);
    for (let i = 0; i < start; i++) {
      await this.page.keyboard.press('ArrowRight');
    }
    for (let i = 0; i < length; i++) {
      await this.page.keyboard.press('Shift+ArrowRight');
    }
  }
}
