import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { roundsDataAtom, streamVideoRangesAtom } from '../state/index.ts';
import { raceDataAtom } from './race-atoms.ts';
import { buildStreamLinkForTimestamp } from '../stream/stream-utils.ts';
import { parseTimestampMs } from '../common/time.ts';

interface RaceNumberProps {
	raceId: string;
}

export function RaceNumber({ raceId }: RaceNumberProps) {
	const roundData = useAtomValue(roundsDataAtom);
	const race = useAtomValue(raceDataAtom(raceId));
	const streamRanges = useAtomValue(streamVideoRangesAtom);

	const raceStartMs = useMemo(() => parseTimestampMs(race?.start ?? null), [race?.start]);
	const raceStreamLink = useMemo(
		() => buildStreamLinkForTimestamp(streamRanges, raceStartMs),
		[streamRanges, raceStartMs],
	);

	if (!race) return null;

	const round = roundData.find((r) => r.id === (race.round ?? ''));

	return (
		<div className='race-number'>
			{raceStreamLink
				? (
					<a
						href={raceStreamLink.href}
						target='_blank'
						rel='noreferrer'
						title={`Watch ${raceStreamLink.label}${raceStreamLink.offsetSeconds > 0 ? ` (+${raceStreamLink.offsetSeconds}s)` : ''}`}
					>
						{`${round?.roundNumber ?? '?'}-${race.raceNumber}`}
					</a>
				)
				: `${round?.roundNumber ?? '?'}-${race.raceNumber}`}
		</div>
	);
}
