import { useAtomValue } from 'jotai';
import { channelsDataAtom, pilotsAtom } from '../state/index.ts';
import type { PBPilotChannelRecord } from '../api/pbTypes.ts';

export function PilotChannelView({ pilotChannel }: PilotChannelViewProps) {
    const pilots = useAtomValue(pilotsAtom);

    const pilot = pilots.find((p) => p.id === pilotChannel.pilot)!;

    const channels = useAtomValue(channelsDataAtom);
    const channel = channels.find((c) => c.id === pilotChannel.channel);
    const color = channel?.channelColor ?? '#888';

    return (
        <div className='pilot-channel'>
            <div className='pilot-info'>
                {pilot.name} {channel?.shortBand}
                {channel?.number}
            </div>
            <div
                className='color-indicator'
                style={{ backgroundColor: color }}
            />
        </div>
    );
}

export interface PilotChannelViewProps {
    pilotChannel: PBPilotChannelRecord;
}