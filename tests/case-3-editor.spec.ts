import { test, expect } from '@playwright/test';
import { EditorPage } from '../pages/EditorPage';

test('Case 3: Rich Text Editor', async ({ page }) => {
  const editor = new EditorPage(page);

  await test.step('3.1 open the online HTML editor', async () => {
    await editor.open();
    await expect(page).toHaveURL('/');
    // CKEditor is a third-party widget built by scripts after the page loads;
    // give it more than the default 5s to appear.
    await expect(editor.editingArea).toBeVisible({ timeout: 15_000 });
  });

  await test.step('3.2 type "Automation Test Example" into the editing area', async () => {
    await editor.typeText('Automation Test Example');
    await expect(editor.editingArea).toHaveText('Automation Test Example');
  });

  await test.step('3.3 make "Automation" bold', async () => {
    await editor.selectRange(0, 'Automation'.length);
    await editor.boldButton.click();
    await expect(editor.editingArea.locator('strong')).toHaveText('Automation');
  });

  await test.step('3.4 make "Test" underlined', async () => {
    await editor.selectRange('Automation '.length, 'Test'.length);
    await editor.underlineButton.click();
    await expect(editor.editingArea.locator('u')).toHaveText('Test');
  });

  await test.step('3.5 validate the editor shows exactly the typed, formatted text', async () => {
    await expect(editor.editingArea).toBeVisible();
    await expect(editor.editingArea).toHaveText(/^Automation Test Example$/, { useInnerText: true });
  });
});
