import { useAtomValue } from 'jotai';
import { channelsDataAtom, pilotsAtom, roundsDataAtom } from '../state/index.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import './NextRaceCompact.css';
import { raceBracketSlotsAtom } from '../bracket/eliminationState.ts';
import { raceDataAtom, racePilotChannelsAtom } from './race-atoms.ts';
import type { NextRaceEntry } from './next-race-entries.ts';

interface NextRaceCompactProps {
	entry: NextRaceEntry;
}

export function NextRaceCompact({ entry }: NextRaceCompactProps) {
	const { raceId, race: entryRace, definition, isPredicted } = entry;
	const raceData = useAtomValue(raceDataAtom(raceId));
	const race = raceData ?? entryRace;
	const pilots = useAtomValue(pilotsAtom);
	const channels = useAtomValue(channelsDataAtom);
	const rounds = useAtomValue(roundsDataAtom);
	const pilotChannels = useAtomValue(racePilotChannelsAtom(raceId));
	const bracketSlots = useAtomValue(raceBracketSlotsAtom(raceId));

	const round = race ? rounds.find((r) => r.id === race.round) : definition ? rounds.find((r) => r.id === definition.roundId) : null;
	const title = race
		? (
			round?.name ? `${round.name} — Race ${race.raceNumber}` : `Round ${round?.roundNumber ?? '?'} — Race ${race.raceNumber}`
		)
		: definition
		? `${definition.roundLabel} — ${definition.name}`
		: 'Upcoming Race';

	const filteredBracketSlots = bracketSlots.filter((slot) => slot.pilotId != null || slot.isPredicted);
	const usingBracketSlots = filteredBracketSlots.length > 0;

	const fallbackSlots = pilotChannels.map((pc) => {
		const pilot = pilots.find((p) => p.id === pc.pilotId);
		const channel = channels.find((c) => c.id === pc.channelId);
		const channelLabel = channel
			? (() => {
				const compact = `${channel.shortBand ?? ''}${channel.number ?? ''}`.trim();
				if (compact) return compact;
				return channel.channelDisplayName ?? '-';
			})()
			: '-';
		return {
			id: pc.id,
			name: pilot?.name ?? '—',
			channelLabel,
			channelId: pc.channelId ?? null,
			isPredicted: false,
		};
	});

	const slots = usingBracketSlots
		? filteredBracketSlots.map((slot) => ({
			id: slot.id,
			name: slot.name,
			channelLabel: slot.channelLabel || '—',
			channelId: slot.channelId,
			isPredicted: slot.isPredicted,
		}))
		: (fallbackSlots.length > 0 ? fallbackSlots : bracketSlots.map((slot) => ({
			id: slot.id,
			name: slot.name,
			channelLabel: slot.channelLabel || '—',
			channelId: slot.channelId,
			isPredicted: slot.isPredicted,
		})));

	return (
		<div
			className='next-race-card next-race-card--dense'
			data-predicted-race={isPredicted ? 'true' : 'false'}
		>
			<div className='next-race-header'>
				<div className='next-race-title'>{title}</div>
			</div>
			<div className='next-race-grid next-race-grid--two'>
				{slots.map((slot) => (
					<div
						className='next-race-slot'
						key={slot.id}
						data-predicted={slot.isPredicted ? 'true' : 'false'}
					>
						<div className='slot-line'>
							<span className='slot-channel-group'>
								<span className='slot-channel'>{slot.channelLabel}</span>
								{slot.channelId ? <ChannelSquare channelID={slot.channelId} /> : null}
							</span>
							<span className='slot-name' title={slot.name}>
								{slot.name}
							</span>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
