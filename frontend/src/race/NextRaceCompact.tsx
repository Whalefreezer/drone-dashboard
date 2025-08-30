import { useAtomValue } from 'jotai';
import { channelsDataAtom, pilotsAtom, roundsDataAtom } from '../state/index.ts';
import type { RaceData } from './race-types.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import './NextRaceCompact.css';

interface NextRaceCompactProps {
    race: RaceData;
}

export function NextRaceCompact({ race }: NextRaceCompactProps) {
    const pilots = useAtomValue(pilotsAtom);
    const channels = useAtomValue(channelsDataAtom);
    const rounds = useAtomValue(roundsDataAtom);

    const round = rounds.find((r) => r.id === race.roundId);
    const title = round?.name
        ? `${round.name} — Race ${race.raceNumber}`
        : `Round ${round?.roundNumber ?? '?'} — Race ${race.raceNumber}`;

    return (
        <div className='next-race-card next-race-card--dense'>
            <div className='next-race-header'>
                <div className='next-race-title'>{title}</div>
            </div>
            <div className='next-race-line'>
                {race.pilotChannels.map((pc) => {
                    const pilot = pilots.find((p) => p.id === pc.pilotId);
                    const channel = channels.find((c) => c.id === pc.channelId);
                    const channelLabel = channel
                        ? `${channel.shortBand ?? ''}${channel.number ?? ''}`
                        : '-';
                    return (
                        <span className='pilot-chip' key={pc.id}>
                            <span className='chip-channel'>{channelLabel}</span>
                            <ChannelSquare channelID={pc.channelId} />
                            <span className='chip-name'>{pilot?.name ?? '—'}</span>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
