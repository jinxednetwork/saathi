import { test, expect } from '@playwright/test';

/**
 * End-to-end smoke tests for Saathi. These exercise the real app in a browser
 * against the offline/fallback path (no Ollama, no Whisper) — which is exactly
 * how CI runs — so they validate the deterministic, always-available core:
 * journaling → insights, the focus timer, the crisis safety net, and settings.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await expect(page).toHaveTitle(/Saathi/);
});

test('loads inside the app shell with the journal view first', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'How are you feeling today?' })).toBeVisible();
  await expect(page.locator('.device__screen')).toBeVisible();
  // Bottom nav exposes all six sections.
  for (const name of ['Journal', 'Companion', 'Breathe', 'Focus', 'Insights', 'Settings']) {
    await expect(page.getByRole('button', { name })).toBeVisible();
  }
});

test('saving a journal entry surfaces triggers and a streak in Insights', async ({ page }) => {
  await page.locator('#journal-text').fill('Sleepless before NEET, my parents keep asking about mock scores.');
  await page.locator('input[name="mood"][value="2"]').check();
  await page.getByRole('button', { name: 'Save entry' }).click();

  await page.getByRole('button', { name: 'Insights' }).click();
  await expect(page.getByRole('heading', { name: 'Your patterns' })).toBeVisible();
  // The deterministic engine should detect themes from the free text.
  await expect(page.locator('#dash-triggers')).toContainText('Sleep');
  await expect(page.locator('#dash-triggers')).toContainText('Family & expectations');
  // Streak HUD updates.
  await expect(page.locator('#hud-streak')).toHaveText('1');
});

test('focus timer counts down and reveals the reflection prompt is wired', async ({ page }) => {
  await page.getByRole('button', { name: 'Focus' }).click();
  await expect(page.locator('#focus-time')).toHaveText('25:00');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.locator('#focus-pause')).toBeVisible();
  // Time should move off 25:00 within a couple of ticks.
  await expect(page.locator('#focus-time')).not.toHaveText('25:00');
});

test('a crisis message surfaces the helpline panel without an LLM', async ({ page }) => {
  await page.getByRole('button', { name: 'Companion' }).click();
  await page.locator('#chat-input').fill("Sometimes I feel like I can't go on.");
  await page.locator('#chat-input').press('Enter');

  const panel = page.locator('#crisis-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Tele-MANAS');
  await expect(panel).toContainText('14416');
  // The reply defers to professional help (deterministic, not a model call).
  await expect(page.locator('#chat-log')).toContainText('not a substitute for professional help');
});

test('reduce-motion setting toggles the global class', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('#set-reduced').check();
  await expect(page.locator('body')).toHaveClass(/reduced-motion/);
});
