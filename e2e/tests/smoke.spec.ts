import { test, expect } from '../src/fixtures';

test('loads home and shows nav', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/NZO Dashboard/i);
	await expect(page.getByRole('navigation')).toBeVisible();
});
