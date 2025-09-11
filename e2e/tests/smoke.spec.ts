import { expect, test } from '../src/fixtures.ts';

test('loads home and shows nav', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/NZO Dashboard/i);
	await expect(page.getByRole('navigation')).toBeVisible();
	await expect(page.getByText('Justhappytobehere')).toBeVisible();
});
