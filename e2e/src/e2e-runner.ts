#!/usr/bin/env -S deno run --allow-run --allow-net --allow-env --allow-read

const CONTAINER_NAME = 'playwright-server';
const SERVER_PORT = 3000;
const FRONTEND_PORT = 5173;
const SERVER_HOST = '0.0.0.0';

/**
 * Check if Docker container exists
 */
async function containerExists(): Promise<boolean> {
	const cmd = new Deno.Command('docker', {
		args: [
			'ps',
			'-a',
			'--filter',
			`name=${CONTAINER_NAME}`,
			'--format',
			'{{.Names}}',
		],
	});
	const { code, stdout } = await cmd.output();
	if (code !== 0) return false;

	const output = new TextDecoder().decode(stdout).trim();
	return output === CONTAINER_NAME;
}

/**
 * Check if Docker container is running
 */
async function containerRunning(): Promise<boolean> {
	const cmd = new Deno.Command('docker', {
		args: [
			'ps',
			'--filter',
			`name=${CONTAINER_NAME}`,
			'--format',
			'{{.Names}}',
		],
	});
	const { code, stdout } = await cmd.output();
	if (code !== 0) return false;

	const output = new TextDecoder().decode(stdout).trim();
	return output === CONTAINER_NAME;
}

/**
 * Start the Playwright server container
 */
async function startServer(): Promise<void> {
	console.log('🚀 Starting Playwright server...');

	const cmd = new Deno.Command('docker', {
		args: [
			'run',
			'-d',
			'--name',
			CONTAINER_NAME,
			'-p',
			`${SERVER_PORT}:${SERVER_PORT}`,
			'--add-host=host.docker.internal:host-gateway',
			'--init',
			'--workdir',
			'/home/pwuser',
			'--user',
			'pwuser',
			'mcr.microsoft.com/playwright:v1.55.0-noble',
			'/bin/sh',
			'-c',
			`npx -y playwright@1.55.0 run-server --port ${SERVER_PORT} --host ${SERVER_HOST}`,
		],
	});

	const { code, stderr } = await cmd.output();
	if (code !== 0) {
		const error = new TextDecoder().decode(stderr);
		throw new Error(`Failed to start server: ${error}`);
	}

	console.log('✅ Server started successfully');
}

/**
 * Stop the Playwright server container
 */
async function stopServer(): Promise<void> {
	console.log('🛑 Stopping Playwright server...');

	const cmd = new Deno.Command('docker', {
		args: ['stop', CONTAINER_NAME],
	});

	const { code, stderr } = await cmd.output();
	if (code !== 0) {
		const error = new TextDecoder().decode(stderr);
		console.warn(`⚠️  Warning: Failed to stop server: ${error}`);
	} else {
		console.log('✅ Server stopped successfully');
	}
}

// Note: Backend and frontend servers are managed by orchestrator.ts

// Note: Backend and frontend server cleanup is handled by orchestrator.ts globalTeardown

/**
 * Run Playwright tests
 */
async function runTests(): Promise<{ success: boolean; output: string }> {
	console.log('🧪 Running Playwright tests...');

	const cmd = new Deno.Command('deno', {
		args: [
			'run',
			'-A',
			'--node-modules-dir',
			'npm:playwright',
			'test',
			'--reporter=line,html',
		],
		env: {
			...Deno.env.toObject(),
			'CI': '1',
			'PW_TEST_CONNECT_WS_ENDPOINT': `ws://0.0.0.0:${SERVER_PORT}/`,
			'PW_TEST_BASE_URL': `http://localhost:${FRONTEND_PORT}`,
		},
	});

	const { code, stdout, stderr } = await cmd.output();
	const output = new TextDecoder().decode(stdout);
	const errorOutput = new TextDecoder().decode(stderr);

	console.log(output);
	if (errorOutput) console.error(errorOutput);

	return { success: code === 0, output: output + errorOutput };
}

/**
 * Show test summary
 */
function showSummary(testOutput: string): void {
	console.log('\n📊 Test Summary');
	console.log('='.repeat(50));

	// Extract test results from output
	const lines = testOutput.split('\n');
	const results = lines.filter((line) =>
		line.includes('passed') ||
		line.includes('failed') ||
		line.includes('skipped') ||
		line.includes('Running') ||
		line.includes('worker')
	);

	results.forEach((line) => console.log(line));

	// Also show the HTML report location
	console.log('\n📄 HTML Report: e2e/playwright-report/index.html');
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
	let serverWasRunning = false;

	try {
		// Check container status
		const exists = await containerExists();
		const running = exists && await containerRunning();

		if (!exists) {
			console.log(
				"📦 Playwright container doesn't exist, creating and starting...",
			);
			await startServer();
		} else if (!running) {
			console.log('🔄 Playwright container exists but stopped, starting...');
			const cmd = new Deno.Command('docker', {
				args: ['start', CONTAINER_NAME],
			});
			const { code } = await cmd.output();
			if (code !== 0) throw new Error('Failed to start existing container');
		} else {
			console.log('✅ Playwright container is already running');
			serverWasRunning = true;
		}

		// Run tests
		const { success, output } = await runTests();

		// Show summary
		showSummary(output);

		// Stop Playwright server if we started it (orchestrator handles others)
		if (!serverWasRunning) {
			await stopServer();
		}

		// Exit with appropriate code
		Deno.exit(success ? 0 : 1);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('❌ Error:', message);

		// Try to stop Playwright server if we started it
		if (!serverWasRunning) {
			try {
				await stopServer();
			} catch {
				// Ignore cleanup errors
			}
		}

		Deno.exit(1);
	}
}

// Run the script
if (import.meta.main) {
	main();
}
