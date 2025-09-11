import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
	testDir: './tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [['list'], ['html', { outputFolder: 'artifacts/report' }]],
	use: {
		baseURL: process.env.E2E_BASE_URL ?? 'http://host.docker.internal:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chromium'] } },
	],
	globalSetup: './src/global.setup.ts',
	globalTeardown: './src/global.teardown.ts',
});
