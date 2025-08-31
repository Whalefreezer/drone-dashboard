import { useAtomValue } from 'jotai';
import { channelsDataAtom, pilotsAtom, roundsDataAtom } from '../state/index.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import './NextRaceCompact.css';
import { raceDataAtom, racePilotChannelsAtom } from './race-atoms.ts';

interface NextRaceCompactProps {
    raceId: string;
}

export function NextRaceCompact({ raceId }: NextRaceCompactProps) {
    const race = useAtomValue(raceDataAtom(raceId));
    const pilots = useAtomValue(pilotsAtom);
    const channels = useAtomValue(channelsDataAtom);
    const rounds = useAtomValue(roundsDataAtom);
    const pilotChannels = useAtomValue(racePilotChannelsAtom(raceId));

    if (!race) return null;

    const round = rounds.find((r) => r.id === race.round);
    const title = round?.name ? `${round.name} — Race ${race.raceNumber}` : `Round ${round?.roundNumber ?? '?'} — Race ${race.raceNumber}`;

    return (
        <div className='next-race-card next-race-card--dense'>
            <div className='next-race-header'>
                <div className='next-race-title'>{title}</div>
            </div>
            <div className='next-race-grid next-race-grid--two'>
                {pilotChannels.map((pc) => {
                    const pilot = pilots.find((p) => p.id === pc.pilotId);
                    const channel = channels.find((c) => c.id === pc.channelId);
                    const channelLabel = channel ? `${channel.shortBand ?? ''}${channel.number ?? ''}` : '-';
                    return (
                        <div className='next-race-slot' key={pc.id}>
                            <div className='slot-line'>
                                <span className='slot-channel-group'>
                                    <span className='slot-channel'>{channelLabel}</span>
                                    <ChannelSquare channelID={pc.channelId} />
                                </span>
                                <span className='slot-name' title={pilot?.name ?? ''}>
                                    {pilot?.name ?? '—'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
