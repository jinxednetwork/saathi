import { test, expect } from '@playwright/test';

/**
 * End-to-end smoke tests for Saathi (design-system build). These drive the real
 * app in a browser against the offline/fallback path (no Ollama, no Whisper) —
 * exactly how CI runs — validating onboarding, journaling → reward, the focus
 * timer, the crisis safety net, and settings.
 */

const SEED = {
  version: 1,
  onboarded: true,
  mascot: { shape: 'pentagon', color: '#639922', accessory: 'sprout', name: 'Pip' },
  entries: [], chat: [], sessions: [],
  settings: { exam: '', examDate: '', muted: false, reducedMotion: false, focusMinutes: 25 }
};

/** Seed an already-onboarded user so a test starts on the Journal tab. */
async function seedOnboarded(page) {
  await page.addInitScript((s) => localStorage.setItem('saathi.v1', s), JSON.stringify(SEED));
}

test('first run shows the mascot builder', async ({ page }) => {
  await page.goto('/index.html'); // no seed → empty storage → onboarding
  await expect(page).toHaveTitle(/Saathi/);
  await expect(page.getByRole('heading', { name: 'Create your saathi' })).toBeVisible();
  await expect(page.locator('#ob-shapes button')).toHaveCount(5);
  await expect(page.locator('#ob-colors button')).toHaveCount(6);
});

test('onboarded user lands on Journal with the four-tab nav', async ({ page }) => {
  await seedOnboarded(page);
  await page.goto('/index.html');
  await expect(page.getByRole('heading', { name: /Namaste/ })).toBeVisible();
  for (const name of ['Journal', 'Focus', 'Pip', 'Breathe']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
});

test('saving a reflection shows the reward sheet with XP', async ({ page }) => {
  await seedOnboarded(page);
  await page.goto('/index.html');
  await page.locator('#mood-options button[data-level="4"]').click();
  await page.locator('#journal-text').fill('Sleepless before NEET; parents kept asking about mock scores.');
  await page.locator('#journal-save').click();
  await expect(page.locator('#overlay-reward')).toBeVisible();
  await expect(page.locator('#overlay-reward')).toContainText('+10');
  await expect(page.locator('#reward-streak')).toHaveText('1');
});

test('focus timer counts down once started', async ({ page }) => {
  await seedOnboarded(page);
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Focus', exact: true }).click();
  await expect(page.locator('#focus-time')).toHaveText('25:00');
  await page.locator('#focus-toggle').click();
  await expect(page.locator('#focus-toggle')).toHaveText('Pause');
  await expect(page.locator('#focus-time')).not.toHaveText('25:00');
});

test('a crisis message surfaces the calm-blue helpline overlay without an LLM', async ({ page }) => {
  await seedOnboarded(page);
  await page.goto('/index.html');
  await page.getByRole('button', { name: 'Pip', exact: true }).click();
  await page.locator('#chat-input').fill("Sometimes I feel like I can't go on.");
  await page.locator('#chat-input').press('Enter');

  const crisis = page.locator('#overlay-crisis');
  await expect(crisis).toBeVisible();
  await expect(crisis).toContainText('Tele-MANAS');
  await expect(crisis).toContainText('14416');
  await expect(page.locator('#chat-log')).toContainText('professional help');
});

test('reduce-motion setting toggles the global class', async ({ page }) => {
  await seedOnboarded(page);
  await page.goto('/index.html');
  await page.locator('#open-settings').click();
  await page.locator('#set-reduced').check();
  await expect(page.locator('body')).toHaveClass(/reduced-motion/);
});
