import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import process from 'node:process';

type Tracked = { name: string; p: ReturnType<typeof spawn> };
const procs: Tracked[] = [];

function mkdirp(p: string) {
	fs.mkdirSync(p, { recursive: true });
}

function tee(
	cmd: string,
	args: string[],
	logPath: string,
	cwd?: string,
	env?: Record<string, string>,
) {
	mkdirp(path.dirname(logPath));
	const spawnEnv = env || process.env;
	const p = spawn(cmd, args, { env: spawnEnv, shell: true, cwd });
	const out = fs.createWriteStream(logPath, { flags: 'a' });
	p.stdout.on('data', (d) => out.write(d));
	p.stderr.on('data', (d) => out.write(d));

	const processName = `${cmd} ${args.join(' ')}`;
	procs.push({ name: processName, p });
	return p;
}

async function checkPortInUse(port: number): Promise<boolean> {
	try {
		const conn = await Deno.connect({ hostname: '0.0.0.0', port });
		conn.close();
		return true;
	} catch {
		return false;
	}
}

async function killProcessOnPort(port: number) {
	try {
		// Find process listening on port using lsof or netstat
		const cmd = spawn('lsof', [`-ti:${port}`], { stdio: 'pipe' });
		let output = '';

		cmd.stdout?.on('data', (data) => {
			output += data.toString();
		});

		await new Promise((resolve, reject) => {
			cmd.on('close', resolve);
			cmd.on('error', reject);
		});

		const pids = output.trim().split('\n').filter(Boolean);
		if (pids.length > 0) {
			for (const pid of pids) {
				try {
					process.kill(parseInt(pid), 'SIGTERM');
					// Brief wait for process to die
					await new Promise((resolve) => setTimeout(resolve, 100));
				} catch {
					// Process might already be dead
				}
			}
		}
	} catch {
		// lsof might not be available, try fallback
		console.log(`⚠️ Could not check processes on port ${port}, continuing...`);
	}
}

async function waitFor(url: string, timeoutMs = 15000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const ok = await new Promise<boolean>((res) => {
			const req = http.get(url, (r) => res((r.statusCode ?? 500) < 500));
			req.on('error', () => res(false));
		});
		if (ok) return;
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`Timeout waiting for ${url}`);
}

function artifactsRoot() {
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	return path.join('artifacts', stamp);
}

export async function globalSetup() {
	const mode = process.env.E2E_MODE ?? 'dev';
	const backendPort = Number(process.env.E2E_BACKEND_PORT ?? 8090);
	const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 5173);
	const artifacts = artifactsRoot();
	process.env.E2E_ARTIFACTS = artifacts;

	// Check for port conflicts and clean them up
	const backendPortInUse = await checkPortInUse(backendPort);
	const frontendPortInUse = await checkPortInUse(frontendPort);

	if (backendPortInUse || frontendPortInUse) {
		if (backendPortInUse) await killProcessOnPort(backendPort);
		if (frontendPortInUse) await killProcessOnPort(frontendPort);
	}

	// Backend (optional skip)
	if (!process.env.E2E_SKIP_BACKEND) {
		tee(
			'go',
			[
				'run',
				'main.go',
				`-port=${backendPort}`,
				'-ingest-enabled=false',
				'--import-snapshot=../snapshots/test1.json',
			],
			path.join(artifacts, 'logs', 'backend.log'),
			path.join('..', 'backend'),
		);
	}
	await waitFor(`http://localhost:${backendPort}`);

	if (mode === 'dev') {
		// Frontend dev server
		// Set VITE_API_URL for frontend to connect to backend
		const frontendEnv = {
			...process.env,
			'VITE_API_URL': `http://host.docker.internal:${backendPort}`,
		};

		tee(
			'deno',
			['task', 'dev', '--host', `--port=${frontendPort}`, '--strictPort'],
			path.join(artifacts, 'logs', 'frontend.log'),
			path.join('..', 'frontend'),
			frontendEnv,
		);

		await waitFor(`http://localhost:${frontendPort}`);
		// Default baseURL for remote PW browsers to reach host
		process.env.E2E_BASE_URL ??= `http://host.docker.internal:${frontendPort}`;
	} else {
		// Production-like: build frontend, then serve via backend static if applicable
		tee(
			'deno',
			['task', 'build'],
			path.join(artifacts, 'logs', 'frontend.log'),
			path.join('..', 'frontend'),
		);
		// In prod mode we target backend port by default
		process.env.E2E_BASE_URL ??= `http://host.docker.internal:${backendPort}`;
	}
}

async function findChildProcesses(parentPid: number): Promise<number[]> {
	try {
		// Use pgrep to find child processes
		const cmd = spawn('pgrep', ['-P', parentPid.toString()], { stdio: 'pipe' });
		let output = '';

		cmd.stdout?.on('data', (data) => {
			output += data.toString();
		});

		await new Promise((resolve, reject) => {
			cmd.on('close', resolve);
			cmd.on('error', reject);
		});

		return output.trim().split('\n').filter(Boolean).map(Number);
	} catch {
		return [];
	}
}

async function killProcessTree(pid: number, name: string) {
	try {
		// Find all child processes
		const children = await findChildProcesses(pid);

		// Kill all child processes first
		for (const childPid of children) {
			try {
				process.kill(childPid, 'SIGTERM');
			} catch {
				// Child might already be dead
			}
		}

		// Then kill the parent
		try {
			process.kill(pid, 'SIGTERM');

			// Wait for graceful shutdown
			await new Promise((resolve) => setTimeout(resolve, 200));

			// Check if parent is still running
			try {
				process.kill(pid, 0); // Signal 0 just checks if process exists
				process.kill(pid, 'SIGKILL'); // Force kill if still running
			} catch {
				// Process is already dead, which is good
			}
		} catch {
			// Parent might already be dead
		}
	} catch {
		console.warn(`⚠️ Failed to kill process tree: ${name}`);
	}
}

export async function globalTeardown() {
	if (procs.length > 0) {
		console.log(`🧹 Cleaning up ${procs.length} test processes...`);
		for (const { name, p } of procs.reverse()) {
			if (p.pid) {
				await killProcessTree(p.pid, name);
			}
		}
	}
}

export default globalSetup;
