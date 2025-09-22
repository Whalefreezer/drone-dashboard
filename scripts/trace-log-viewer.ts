import { parse } from "https://deno.land/std@0.224.0/flags/mod.ts";
import { readLines } from "https://deno.land/std@0.224.0/io/read_lines.ts";

type LogEntry = {
	ts: number;
	line: string;
	label: string;
	order: number;
};

const args = parse(Deno.args, {
	string: ["trace", "cloud", "pits"],
	boolean: ["help"],
	alias: {
		trace: "t",
		help: "h",
	},
});

if (args.help) {
	printUsage();
	Deno.exit(0);
}

const cloudPath = args.cloud as string | undefined;
const pitsPath = args.pits as string | undefined;
const traceFilter = args.trace as string | undefined;

if (!cloudPath || !pitsPath) {
	console.error("Both --cloud and --pits file paths are required.");
	printUsage();
	Deno.exit(1);
}

const entries: LogEntry[] = [];
let order = 0;

try {
	await collectLogs("cloud", cloudPath, entries, () => order++);
} catch (error) {
	console.error(
		`Failed to read cloud logs from ${cloudPath}: ${
			error instanceof Error ? error.message : String(error)
		}`,
	);
	Deno.exit(1);
}

try {
	await collectLogs("pits", pitsPath, entries, () => order++);
} catch (error) {
	console.error(
		`Failed to read pits logs from ${pitsPath}: ${
			error instanceof Error ? error.message : String(error)
		}`,
	);
	Deno.exit(1);
}

entries.sort((a, b) => {
	if (a.ts === b.ts) {
		return a.order - b.order;
	}
	if (Number.isNaN(a.ts)) {
		return 1;
	}
	if (Number.isNaN(b.ts)) {
		return -1;
	}
	return a.ts - b.ts;
});

for (const entry of entries) {
	if (traceFilter && !entry.line.includes(traceFilter)) {
		continue;
	}
	console.log(`[${entry.label}] ${entry.line}`);
}

async function collectLogs(
	label: string,
	path: string,
	acc: LogEntry[],
	nextOrder: () => number,
) {
	const file = await Deno.open(path);
	try {
		let localOrder = nextOrder();
		for await (const line of readLines(file)) {
			const ts = extractTimestamp(line);
			acc.push({ ts, line, label, order: localOrder });
			localOrder = nextOrder();
		}
	} finally {
		file.close();
	}
}

function extractTimestamp(line: string): number {
	const match = line.match(
		/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/,
	);
	if (!match) {
		return Number.NaN;
	}
	const iso = match[1];
	const normalized = /[+-]\d{2}:\d{2}$/.test(iso)
		? iso
		: iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
	const parsed = Date.parse(normalized);
	return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function printUsage() {
	console.log(
		`Trace Log Viewer\n\nUsage:\n  deno run -A scripts/trace-log-viewer.ts --cloud CLOUD.log --pits PITS.log [--trace abc123]\n\nOptions:\n  --cloud <path>  Cloud log file to ingest.\n  --pits <path>   Pits log file to ingest.\n  --trace <id>    Optional traceId substring filter.\n  -h, --help      Show this help message.`,
	);
}
