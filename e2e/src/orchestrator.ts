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

function tee(cmd: string, args: string[], logPath: string, cwd?: string) {
	mkdirp(path.dirname(logPath));
	const p = spawn(cmd, args, { env: process.env, shell: true, cwd });
	const out = fs.createWriteStream(logPath, { flags: 'a' });
	p.stdout.on('data', (d) => out.write(d));
	p.stderr.on('data', (d) => out.write(d));
	procs.push({ name: `${cmd} ${args.join(' ')}`, p });
	return p;
}

async function waitFor(url: string, timeoutMs = 60000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const ok = await new Promise<boolean>((res) => {
			const req = http.get(url, (r) => res((r.statusCode ?? 500) < 500));
			req.on('error', () => res(false));
		});
		if (ok) return;
		await new Promise((r) => setTimeout(r, 500));
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

	// Backend (optional skip)
	if (!process.env.E2E_SKIP_BACKEND) {
		tee(
			'go',
			['run', 'main.go', `-port=${backendPort}`, '-ingest-enabled=false'],
			path.join(artifacts, 'logs', 'backend.log'),
			path.join('..', 'backend'),
		);
	}
	await waitFor(`http://localhost:${backendPort}`);

	if (mode === 'dev') {
		// Frontend dev server (optional skip)
		if (!process.env.E2E_SKIP_FRONTEND) {
			tee(
				'deno',
				['task', 'dev', '--host'],
				path.join(artifacts, 'logs', 'frontend.log'),
				path.join('..', 'frontend'),
			);
		}
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

export async function globalTeardown() {
	for (const { p } of procs.reverse()) {
		try {
			p.kill('SIGTERM');
		} catch {}
	}
}

export default globalSetup;
