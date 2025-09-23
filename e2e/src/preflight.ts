#!/usr/bin/env -S deno run -A

type ProcSpec = {
	label: string;
	cmd: string;
	args: string[];
	cwd?: string;
	env?: Record<string, string>;
};

function prefix(label: string, line: string) {
	return `[${label}] ${line}`;
}

async function streamProcess(spec: ProcSpec): Promise<number> {
	const p = new Deno.Command(spec.cmd, {
		args: spec.args,
		cwd: spec.cwd,
		env: spec.env,
		stdin: 'inherit',
		stdout: 'piped',
		stderr: 'piped',
	}).spawn();

	const pump = async (
		readable: ReadableStream<Uint8Array> | null,
		isErr: boolean,
	) => {
		if (!readable) return;
		const dec = new TextDecoder();
		let buf = '';
		for await (const chunk of readable) {
			buf += dec.decode(chunk, { stream: true });
			let idx: number;
			while ((idx = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, idx);
				buf = buf.slice(idx + 1);
				(isErr ? console.error : console.log)(prefix(spec.label, line));
			}
		}
		if (buf.length) {
			(isErr ? console.error : console.log)(prefix(spec.label, buf));
		}
	};

	await Promise.all([
		pump(p.stdout, false),
		pump(p.stderr, true),
	]);
	const status = await p.status;
	return status.code;
}

async function runSeq(label: string, steps: ProcSpec[]): Promise<number> {
	for (const s of steps) {
		const code = await streamProcess({ ...s, label });
		if (code !== 0) return code;
	}
	return 0;
}

async function main() {
	const root = Deno.cwd();
	const e2eDir = root;
	const frontendDir = new URL('../frontend', `file://${root}/`).pathname;
	const backendDir = new URL('../backend', `file://${root}/`).pathname;

	const jobs: Promise<number>[] = [];

	// e2e verify
	jobs.push(streamProcess({
		label: 'e2e-verify',
		cmd: 'deno',
		args: ['task', 'verify'],
		cwd: e2eDir,
	}));

	// frontend verify
	jobs.push(streamProcess({
		label: 'fe-verify',
		cmd: 'deno',
		args: ['task', 'verify'],
		cwd: frontendDir,
	}));

	// backend vet + test (sequential under a single label)
	jobs.push(runSeq('be-verify', [
		{ label: 'be-verify', cmd: 'go', args: ['vet', './...'], cwd: backendDir },
	]));

	// e2e run (playwright)
	// jobs.push(streamProcess({
	// 	label: 'e2e-run',
	// 	cmd: 'deno',
	// 	args: ['task', 'e2e:run'],
	// 	cwd: e2eDir,
	// }));

	const codes = await Promise.all(jobs);
	const names = ['e2e-verify', 'fe-verify', 'be-verify', 'e2e-run'];
	let ok = true;
	for (let i = 0; i < codes.length; i++) {
		const code = codes[i] ?? 1;
		const name = names[i] ?? `job-${i}`;
		if (code === 0) console.log(prefix('summary', `${name}: OK`));
		else {
			ok = false;
			console.error(prefix('summary', `${name}: FAIL (exit ${code})`));
		}
	}
	Deno.exit(ok ? 0 : 1);
}

if (import.meta.main) main();
