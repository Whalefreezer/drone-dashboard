import path from 'node:path';

function basename(p: string): string {
	const i = p.lastIndexOf('/');
	return i >= 0 ? p.slice(i + 1) : p;
}

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

async function tailFile(path: string, lines = 80): Promise<string> {
	try {
		const txt = await Deno.readTextFile(path);
		const all = txt.split(/\r?\n/);
		return all.slice(-lines).join('\n');
	} catch {
		return `${basename(path)}: (missing)`;
	}
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

async function main() {
	const root = 'artifacts';
	const json = await readJson(path.join(root, 'summary.json'));
	const runDir = await latestRunDir(root);

	console.log(color('== Playwright Summary ==', 36));
	if (!json) {
		console.log(
			'No artifacts/summary.json found. Run tests first with `deno task e2e`.',
		);
	} else {
		const stats: Stats = json.stats ?? {};
		console.log(
			`tests: expected=${stats.expected ?? 0} unexpected=$
				{stats.unexpected ?? 0}
			} flaky=${stats.flaky ?? 0} skipped=${stats.skipped ?? 0}`,
		);
		const failures: { title: string; error?: string }[] = [];
		if (json.suites) {
			for (const suite of json.suites) {
				extractFailures(suite, failures);
			}
		}
		if (failures.length) {
			console.log(color('\nFailures:', 31));
			for (const f of failures) {
				console.log(`- ${f.title}`);
				if (f.error) {
					console.log(color(`  ${f.error}`.replaceAll('\n', '\n  '), 90));
				}
			}
		} else {
			console.log(color('No failing tests found in JSON report.', 32));
		}
	}

	console.log(color('\n== Orchestrator Logs ==', 36));
	if (!runDir) {
		console.log('No timestamped run directory found under artifacts/.');
		console.log(
			'Expected: artifacts/<timestamp>/logs/backend.log, frontend.log',
		);
		return;
	}
	console.log(`latest: ${runDir}`);
	const back = await tailFile(path.join(runDir, 'logs', 'backend.log'));
	const front = await tailFile(path.join(runDir, 'logs', 'frontend.log'));
	console.log(color('\nbackend.log (tail):', 33));
	console.log(back);
	console.log(color('\nfrontend.log (tail):', 33));
	console.log(front);

	console.log(color('\n== HTML Report ==', 36));
	console.log('Open with: deno task playwright show-report artifacts/report');
}

if (import.meta.main) main();
