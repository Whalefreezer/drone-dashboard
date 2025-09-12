import { test as base } from '@playwright/test';

export const test = base.extend({
	page: async ({ page }, use, testInfo) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
		page.on('console', (msg) => {
			if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
		});
		page.on('requestfailed', (req) => {
			errors.push(
				`requestfailed: ${req.method()} ${req.url()} → ${req.failure()?.errorText}`,
			);
		});
		await use(page);
		if (errors.length) {
			await testInfo.attach('errors.txt', { body: errors.join('\n') });
			throw new Error(errors.join('\n'));
		}
	},
});

export const expect = test.expect;
