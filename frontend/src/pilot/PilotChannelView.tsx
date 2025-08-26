import { useAtomValue } from 'jotai';
import { channelsDataAtom, pilotsAtom } from '../state/index.ts';
import { PilotChannel } from '../types/index.ts';

export function PilotChannelView({ pilotChannel }: PilotChannelViewProps) {
    const pilots = useAtomValue(pilotsAtom);

    const pilot = pilots.find((p) => p.sourceId === pilotChannel.Pilot)!;

    const channels = useAtomValue(channelsDataAtom);
    const channel = channels.find((c) => c.sourceId === pilotChannel.Channel);
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
    pilotChannel: PilotChannel;
}