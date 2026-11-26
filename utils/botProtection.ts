import type { Page } from '@playwright/test';

// Exact titles of bot-protection challenge pages. A page that merely "looks different" is never a reason to skip.
const CHALLENGE_TITLES = ['Attention Required! | Cloudflare', 'Just a moment...', 'Just a moment…'];

/** True only when the page is a bot-protection challenge (seen on GitHub-hosted runners, see README "CI limitations"). */
export async function isBotChallenge(page: Page): Promise<boolean> {
  await page.waitForLoadState('domcontentloaded');
  return CHALLENGE_TITLES.includes(await page.title());
}
