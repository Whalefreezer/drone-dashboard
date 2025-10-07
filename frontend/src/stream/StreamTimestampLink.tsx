import type { ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';
import { streamVideoRangesAtom } from '../state/pbAtoms.ts';
import { buildStreamLinkForTimestamp } from './stream-utils.ts';

interface StreamTimestampLinkProps {
	timestampMs: number | null | undefined;
	children: ReactNode;
	title?: string;
	className?: string;
}

export function StreamTimestampLink({ timestampMs, children, title, className }: StreamTimestampLinkProps) {
	const ranges = useAtomValue(streamVideoRangesAtom);
	const link = useMemo(
		() => buildStreamLinkForTimestamp(ranges, timestampMs ?? null),
		[ranges, timestampMs],
	);

	if (timestampMs == null || !Number.isFinite(timestampMs) || !link) {
		return <>{children}</>;
	}

	const linkTitle = title ?? `Watch ${link.label}${link.offsetSeconds > 0 ? ` (+${link.offsetSeconds}s)` : ''}`;

	return (
		<a href={link.href} target='_blank' rel='noreferrer' title={linkTitle} className={className}>
			{children}
		</a>
	);
}
