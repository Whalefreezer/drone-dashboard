#!/usr/bin/env -S deno run --allow-run --allow-net --allow-env --allow-read

const CONTAINER_NAME = 'playwright-server';
const SERVER_PORT = 3000;
const FRONTEND_PORT = 5173;
const BACKEND_PORT = 8090;
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

/**
 * Start the frontend dev server
 */
async function startFrontend(): Promise<Deno.ChildProcess> {
	console.log('🚀 Starting frontend dev server...');

	const cmd = new Deno.Command('deno', {
		args: ['task', 'dev', '--host', '0.0.0.0'],
		cwd: '../frontend',
		env: {
			...Deno.env.toObject(),
			'E2E_BASE_URL': `http://localhost:${FRONTEND_PORT}`,
			'VITE_API_URL': `http://localhost:${BACKEND_PORT}`,
			'NO_COLOR': '1', // Disable colors to avoid TTY issues
		},
		stdout: 'null',
		stderr: 'null',
	});

	// Start the process in background and return it for later cleanup
	const process = cmd.spawn();

	console.log('✅ Frontend server started successfully');

	return process;
}

/**
 * Start the backend server
 */
async function startBackend(): Promise<Deno.ChildProcess> {
	console.log('🚀 Starting backend server...');

	const cmd = new Deno.Command('go', {
		args: [
			'run',
			'main.go',
			`-port=${BACKEND_PORT}`,
			'-ingest-enabled=false',
			'--import-snapshot=../snapshots/test1.json',
		],
		cwd: '../backend',
		env: {
			...Deno.env.toObject(),
		},
		stdout: 'null',
		stderr: 'null',
	});

	// Start the process in background and return it for later cleanup
	const process = cmd.spawn();

	console.log('✅ Backend server started successfully');

	return process;
}

/**
 * Stop the frontend dev server
 */
async function stopFrontend(process: Deno.ChildProcess): Promise<void> {
	console.log('🛑 Stopping frontend server...');

	try {
		// Try to kill the process gracefully first
		process.kill('SIGTERM');

		// Wait a bit for graceful shutdown
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// If it's still running, force kill it
		if (!process.killed) {
			process.kill('SIGKILL');
		}

		console.log('✅ Frontend server stopped successfully');
	} catch (error) {
		console.warn(
			`⚠️  Warning: Failed to stop frontend server: ${error.message}`,
		);
	}
}

/**
 * Stop the backend server
 */
async function stopBackend(process: Deno.ChildProcess): Promise<void> {
	console.log('🛑 Stopping backend server...');

	try {
		// Try to kill the process gracefully first
		process.kill('SIGTERM');

		// Wait a bit for graceful shutdown
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// If it's still running, force kill it
		if (!process.killed) {
			process.kill('SIGKILL');
		}

		console.log('✅ Backend server stopped successfully');
	} catch (error) {
		console.warn(
			`⚠️  Warning: Failed to stop backend server: ${error.message}`,
		);
	}
}

/**
 * Wait for servers to be ready
 */
async function waitForServers(maxAttempts = 3): Promise<void> {
	console.log('⏳ Waiting for servers to be ready...');

	let playwrightReady = false;
	let frontendReady = false;
	let backendReady = false;

	for (let i = 0; i < maxAttempts; i++) {
		// Check Playwright server
		if (!playwrightReady) {
			try {
				const conn = await Deno.connect({
					hostname: '0.0.0.0',
					port: SERVER_PORT,
				});
				conn.close();
				playwrightReady = true;
				console.log('✅ Playwright server is ready!');
			} catch {
				// Still waiting
			}
		}

		// Check frontend server
		if (!frontendReady) {
			try {
				const response = await fetch(`http://localhost:${FRONTEND_PORT}`);
				if (response.ok) {
					frontendReady = true;
					console.log('✅ Frontend server is ready!');
				}
			} catch (error) {
				// Still waiting, but log the error for debugging
				if (i === maxAttempts - 1) {
					console.log(`❌ Frontend server check failed: ${error.message}`);
				}
			}
		}

		// Check backend server
		if (!backendReady) {
			try {
				const response = await fetch(`http://localhost:${BACKEND_PORT}/health`);
				if (response.ok) {
					backendReady = true;
					console.log('✅ Backend server is ready!');
				}
			} catch (error) {
				// Still waiting, but log the error for debugging
				if (i === maxAttempts - 1) {
					console.log(`❌ Backend server check failed: ${error.message}`);
				}
			}
		}

		if (playwrightReady && frontendReady && backendReady) {
			console.log('🎉 All servers are ready!');
			return;
		}

		console.log(`   Attempt ${i + 1}/${maxAttempts}...`);
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	throw new Error('Servers failed to start within timeout');
}

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
			'E2E_SKIP_FRONTEND': '1', // Prevent global setup from starting its own frontend
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
async function showSummary(testOutput: string): Promise<void> {
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
	let frontendProcess: Deno.ChildProcess | null = null;
	let backendProcess: Deno.ChildProcess | null = null;

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

		// Always start backend (we need fresh state for tests)
		console.log('🔄 Starting backend server...');
		backendProcess = await startBackend();

		// Always start frontend (it's lightweight and we want fresh state)
		console.log('🔄 Starting frontend dev server...');
		// Set environment variable to override the default host.docker.internal
		Deno.env.set('E2E_BASE_URL', `http://localhost:${FRONTEND_PORT}`);
		frontendProcess = await startFrontend();

		// Wait for all servers to be ready
		await waitForServers();

		// Run tests
		const { success, output } = await runTests();

		// Show summary
		await showSummary(output);

		// Stop servers only if we started them
		if (!serverWasRunning) {
			await stopServer();
		}

		// Stop backend if we started it
		if (backendProcess) {
			await stopBackend(backendProcess);
		}

		// Stop frontend if we started it
		if (frontendProcess) {
			await stopFrontend(frontendProcess);
		}

		// Exit with appropriate code
		Deno.exit(success ? 0 : 1);
	} catch (error) {
		console.error('❌ Error:', error.message);

		// Try to stop servers if we started them
		if (!serverWasRunning) {
			try {
				await stopServer();
			} catch {
				// Ignore cleanup errors
			}
		}

		// Try to stop backend if we started it
		if (backendProcess) {
			try {
				await stopBackend(backendProcess);
			} catch {
				// Ignore cleanup errors
			}
		}

		// Try to stop frontend if we started it
		if (frontendProcess) {
			try {
				await stopFrontend(frontendProcess);
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
