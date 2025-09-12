import path from 'node:path';

// basename was used by the old tail helper; remove to satisfy lint.

type TestError = {
	message?: string;
	value?: string;
};

type TestResult = {
	outcome: string;
	titlePath?: string[];
	title: string;
	errors?: TestError[];
	error?: TestError;
};

type SuiteResult = {
	tests?: TestResult[];
	suites?: SuiteResult[];
};

type Stats = {
	expected?: number;
	unexpected?: number;
	flaky?: number;
	skipped?: number;
};

type JsonReport = {
	stats?: Stats;
	suites?: SuiteResult[];
};

function color(label: string, code: number) {
	return `\x1b[${code}m${label}\x1b[0m`;
}

function stripAnsi(s: string): string {
	// Remove ANSI CSI sequences without using control chars in regex.
	let out = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s.charCodeAt(i);
		// ESC (27) or CSI (155)
		if (ch === 27 || ch === 155) {
			// Skip until a final byte in the range @ (64) to ~ (126)
			i++;
			while (i < s.length) {
				const c = s.charCodeAt(i);
				if (c >= 64 && c <= 126) break;
				i++;
			}
			continue;
		}
		out += s[i]!;
	}
	return out;
}

async function readJson(path: string): Promise<JsonReport | null> {
	try {
		const txt = await Deno.readTextFile(path);
		return JSON.parse(txt);
	} catch {
		return null;
	}
}

async function latestRunDir(root: string): Promise<string | null> {
	try {
		const entries: string[] = [];
		for await (const e of Deno.readDir(root)) {
			if (e.isDirectory && e.name !== 'report') entries.push(e.name);
		}
		if (!entries.length) return null;
		entries.sort();
		return path.join(root, entries[entries.length - 1]!);
	} catch {
		return null;
	}
}

// (removed tailFile; summary now prints only error lines for brevity)

const ERROR_PATTERNS = [
	/\berror\b/i,
	/\berro\b/i, // some loggers abbreviate as ERRO
	/level=error/i,
	/\bfatal\b/i,
	/\bpanic\b/i,
	/\bexception\b/i,
];

function buildErrorContexts(
	text: string,
	before = Number(Deno.env.get('E2E_LOG_CONTEXT_BEFORE') ?? '3'),
	after = Number(Deno.env.get('E2E_LOG_CONTEXT_AFTER') ?? '3'),
	maxSegments = Number(Deno.env.get('E2E_LOG_CONTEXT_SEGMENTS') ?? '8'),
	maxTotalLines = Number(Deno.env.get('E2E_LOG_CONTEXT_MAX_LINES') ?? '200'),
): string[] {
	const clean = stripAnsi(text);
	const lines = clean.split(/\r?\n/);
	const n = lines.length;
	const hitRanges: { start: number; end: number }[] = [];

	for (let i = 0; i < n; i++) {
		const line = lines[i] ?? '';
		if (ERROR_PATTERNS.some((re) => re.test(line))) {
			const start = Math.max(0, i - before);
			const end = Math.min(n - 1, i + after);
			hitRanges.push({ start, end });
		}
	}
	if (hitRanges.length === 0) return [];

	// Merge overlapping/adjacent ranges
	hitRanges.sort((a, b) => a.start - b.start);
	const merged: { start: number; end: number }[] = [];
	for (const r of hitRanges) {
		const last = merged[merged.length - 1];
		if (!last || r.start > last.end + 1) merged.push({ ...r });
		else last.end = Math.max(last.end, r.end);
	}

	// Keep the most recent segments within limits
	const slices = merged.slice(-maxSegments);
	const out: string[] = [];
	let total = 0;
	for (let idx = 0; idx < slices.length; idx++) {
		const { start, end } = slices[idx]!;
		const header = `--- lines ${start + 1}-${end + 1} ---`;
		const seg: string[] = [header];
		for (let j = start; j <= end; j++) {
			const ln = String(j + 1).padStart(5, ' ');
			seg.push(`${ln} | ${lines[j] ?? ''}`);
		}
		if (total + seg.length > maxTotalLines) break;
		out.push(...seg);
		total += seg.length;
	}
	return out;
}

function extractFailures(
	node: SuiteResult | undefined,
	out: { title: string; error?: string }[],
) {
	if (!node) return;
	if (node.tests) {
		for (const t of node.tests) {
			if (t.outcome === 'unexpected' || t.outcome === 'flaky') {
				const err = t.errors?.[0]?.message ?? t.error?.message ??
					t.error?.value;
				out.push({ title: t.titlePath?.join(' › ') ?? t.title, error: err });
			}
		}
	}
	if (node.suites) { for (const s of node.suites) extractFailures(s, out); }
}

export async function main() {
	const root = 'artifacts';
	const json = await readJson(path.join(root, 'summary.json'));
	const runDir = await latestRunDir(root);

	// Quiet by default: only output when there are unexpected (failing) tests
	// OR when backend/frontend logs contain errors.
	const stats: Stats | undefined = json?.stats;
	const hasFailures = (stats?.unexpected ?? 0) > 0;

	let backendErrors: string[] = [];
	let frontendErrors: string[] = [];
	let missingBackend = false;
	let missingFrontend = false;
	if (runDir) {
		try {
			const backAll = await Deno.readTextFile(
				path.join(runDir, 'logs', 'backend.log'),
			);
			backendErrors = buildErrorContexts(backAll);
		} catch {
			missingBackend = true;
		}
		try {
			const frontAll = await Deno.readTextFile(
				path.join(runDir, 'logs', 'frontend.log'),
			);
			frontendErrors = buildErrorContexts(frontAll);
		} catch {
			missingFrontend = true;
		}
	}

	const hasLogErrors = backendErrors.length > 0 || frontendErrors.length > 0;
	const hasMissingLogs = !runDir || missingBackend || missingFrontend;
	if (!hasFailures && !hasLogErrors && !hasMissingLogs) return; // All good — stay silent.

	if (hasFailures) {
		console.log(color('== Playwright Summary ==', 36));
		console.log(
			`tests: expected=${stats?.expected ?? 0} unexpected=${
				stats?.unexpected ?? 0
			} flaky=${stats?.flaky ?? 0} skipped=${stats?.skipped ?? 0}`,
		);
		const failures: { title: string; error?: string }[] = [];
		if (json?.suites) {
			for (const suite of json.suites) extractFailures(suite, failures);
		}
		if (failures.length) {
			console.log(color('\nFailures:', 31));
			for (const f of failures) {
				console.log(`- ${f.title}`);
				if (f.error) {
					console.log(color(`  ${f.error}`.replaceAll('\n', '\n  '), 90));
				}
			}
		}
	}

	if (hasLogErrors || hasMissingLogs) {
		console.log(color('\n== Orchestrator Errors ==', 36));
		if (runDir) console.log(`latest: ${runDir}`);
		if (!runDir) console.log(color('Missing artifacts run directory.', 31));
		if (missingBackend) console.log(color('Missing backend.log', 31));
		if (missingFrontend) console.log(color('Missing frontend.log', 31));
		if (backendErrors.length) {
			console.log(color('\nbackend.log (errors):', 33));
			console.log(backendErrors.join('\n'));
		}
		if (frontendErrors.length) {
			console.log(color('\nfrontend.log (errors):', 33));
			console.log(frontendErrors.join('\n'));
		}
	}

	console.log(color('\n== HTML Report ==', 36));
	console.log('Open with: deno task playwright show-report artifacts/report');
}

if (import.meta.main) await main();
