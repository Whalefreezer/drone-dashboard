import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Column } from './GenericTable.tsx';
import { useAtom } from 'jotai';
import { getColumnPrefsAtom } from './columnPrefs.ts';

export function ColumnChooser<TableCtx, RowCtx extends object>(
	{
		tableId,
		columns,
		label = 'Columns',
		compact = true,
		defaultVisible,
	}: { tableId: string; columns: Array<Column<TableCtx, RowCtx>>; label?: string; compact?: boolean; defaultVisible?: string[] },
) {
	const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
	const defaults = useMemo(() => {
		if (!defaultVisible) return allKeys;
		const allowed = new Set(allKeys);
		return defaultVisible.filter((key) => allowed.has(key));
	}, [allKeys, defaultVisible]);
	const prefsAtom = useMemo(() => getColumnPrefsAtom(tableId, allKeys, defaults), [tableId, allKeys, defaults]);
	const [visible, setVisible] = useAtom(prefsAtom);
	const [open, setOpen] = useState(false);
	const labelFor = (c: Column<TableCtx, RowCtx>) => c.label ?? (typeof c.header === 'string' ? c.header : c.key);

	const toggle = (key: string) => {
		setVisible((prev) => {
			const set = new Set(prev);
			if (set.has(key)) set.delete(key);
			else set.add(key);
			return Array.from(set);
		});
	};

	const setAll = (on: boolean) => {
		setVisible(on ? allKeys : []);
	};

	const btnRef = useRef<HTMLButtonElement>(null);
	const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

	useEffect(() => {
		if (!open) return;
		const el = btnRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const margin = 6;
		const left = Math.max(8, Math.min(rect.right - 220, globalThis.innerWidth - 228));
		const top = Math.min(rect.bottom + margin, globalThis.innerHeight - 8);
		setPos({ top, left });
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			const chooser = document.getElementById(`col-pop-${tableId}`);
			if (!chooser) return;
			if (btnRef.current?.contains(e.target as Node)) return;
			if (!chooser.contains(e.target as Node)) setOpen(false);
		};
		globalThis.addEventListener('mousedown', onDown);
		return () => globalThis.removeEventListener('mousedown', onDown);
	}, [open, tableId]);

	const buttonStyle: React.CSSProperties = compact
		? { width: 28, height: 28, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
		: { padding: '4px 8px' };

	const buttonContent = compact ? <span aria-hidden title={label} style={{ fontSize: 16 }}>☰</span> : <span>{label}</span>;

	// Derive grouped items for the chooser
	const groups = useMemo(() => {
		const byGroup = new Map<string, { label: string; keys: string[]; firstIndex: number }>();
		const singles: Array<{ label: string; key: string; index: number }> = [];
		columns.forEach((c, index) => {
			if (c.group) {
				const existing = byGroup.get(c.group);
				if (existing) {
					existing.keys.push(c.key);
					existing.firstIndex = Math.min(existing.firstIndex, index);
				} else {
					byGroup.set(c.group, {
						label: c.groupLabel ?? c.label ?? 'Group',
						keys: [c.key],
						firstIndex: index,
					});
				}
			} else {
				singles.push({ label: labelFor(c), key: c.key, index });
			}
		});
		const orderedSingles = singles.sort((a, b) => a.index - b.index);
		const orderedGroups = Array.from(byGroup.values()).sort((a, b) => a.firstIndex - b.firstIndex);
		return { orderedGroups, orderedSingles };
	}, [columns]);

	const popover = open && pos && createPortal(
		<div
			id={`col-pop-${tableId}`}
			style={{
				position: 'fixed',
				top: pos.top,
				left: pos.left,
				zIndex: 1000,
				background: '#1f2937',
				border: '1px solid #374151',
				borderRadius: 6,
				padding: 8,
				minWidth: 220,
				color: '#e5e7eb',
				boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
			}}
		>
			<div style={{ display: 'flex', gap: 8, marginBottom: 6, justifyContent: 'space-between' }}>
				<div style={{ display: 'flex', gap: 8 }}>
					<button type='button' onClick={() => setAll(true)} style={{ padding: '2px 6px' }}>All</button>
					<button type='button' onClick={() => setAll(false)} style={{ padding: '2px 6px' }}>None</button>
				</div>
				<button type='button' onClick={() => setVisible(defaults)} style={{ padding: '2px 6px' }} title='Reset to breakpoint defaults'>
					Reset
				</button>
			</div>
			<div style={{ display: 'grid', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
				{/* Singles first (preserve table order) */}
				{groups.orderedSingles.map((s) => {
					const checked = visible.includes(s.key);
					return (
						<label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
							<input
								type='checkbox'
								checked={checked}
								onChange={() => toggle(s.key)}
							/>
							<span>{s.label}</span>
						</label>
					);
				})}

				{/* Grouped sections next (preserve first-column position order) */}
				{groups.orderedGroups.map((g, idx) => {
					const allOn = g.keys.every((k) => visible.includes(k));
					const someOn = !allOn && g.keys.some((k) => visible.includes(k));
					return (
						<label key={`group:${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
							<input
								type='checkbox'
								checked={allOn}
								ref={(el) => {
									if (el) el.indeterminate = someOn;
								}}
								onChange={() => {
									setVisible((prev) => {
										const set = new Set(prev);
										if (g.keys.every((k) => set.has(k))) {
											g.keys.forEach((k) => set.delete(k));
										} else {
											g.keys.forEach((k) => set.add(k));
										}
										return Array.from(set);
									});
								}}
							/>
							<span>{g.label}</span>
						</label>
					);
				})}
			</div>
		</div>,
		document.body,
	);

	return (
		<div style={{ position: 'relative', display: 'inline-block' }}>
			<button ref={btnRef} type='button' onClick={() => setOpen((v) => !v)} style={buttonStyle} aria-label={label} title={label}>
				{buttonContent}
			</button>
			{popover}
		</div>
	);
}
