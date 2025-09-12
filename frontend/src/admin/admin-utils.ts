export function formatEpochMs(v?: number) {
	if (!v || typeof v !== 'number') return '';
	try {
		const d = new Date(v);
		if (isNaN(d.getTime())) return String(v);
		return d.toLocaleString();
	} catch {
		return String(v);
	}
}

export function formatSecondsFromNow(v?: number) {
	if (!v || typeof v !== 'number') return '';
	const diffSec = (v - Date.now()) / 1000;
	const sign = diffSec >= 0 ? '+' : '-';
	const val = Math.round(Math.abs(diffSec));
	return `${sign}${val}s`;
}

export type SettingKind = 'boolean' | 'number' | 'text';

export function inferSettingKind(key: unknown): SettingKind {
	const lower = String(key ?? '').toLowerCase();
	if (lower.endsWith('.enabled') || lower.endsWith('enabled')) return 'boolean';
	if (/(ms|interval|timeout|delay|jitter|burst|concurrency)$/i.test(lower)) return 'number';
	return 'text';
}

export function normalizeSettingValue(kind: SettingKind, val: string): string {
	if (kind === 'boolean') return String(val === 'true');
	if (kind === 'number') {
		const n = Number(val);
		return Number.isFinite(n) ? String(n) : '0';
	}
	return val;
}
