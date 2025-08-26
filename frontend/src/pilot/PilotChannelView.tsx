import { useAtomValue } from 'jotai';
import { channelsDataAtom, eventDataAtom, pilotsAtom } from '../state/index.ts';
import { PilotChannelViewProps } from './pilot-types.ts';

export function PilotChannelView({ pilotChannel }: PilotChannelViewProps) {
    const pilots = useAtomValue(pilotsAtom);
    const channels = useAtomValue(channelsDataAtom);
    const eventData = useAtomValue(eventDataAtom);

    const pilot = pilots.find((p) => p.sourceId === pilotChannel.Pilot)!;
    const channel = channels.find((c) => c.sourceId === pilotChannel.Channel)!;

    const colorIndex = eventData?.[0]?.Channels?.indexOf(pilotChannel.Channel);
    const color = (eventData?.[0]?.ChannelColors && colorIndex !== undefined && colorIndex > -1)
        ? eventData[0].ChannelColors[colorIndex]
        : '#888';

    return (
        <div className='pilot-channel'>
            <div className='pilot-info'>
                {pilot.name} {channel.shortBand}
                {channel.number}
            </div>
            <div
                className='color-indicator'
                style={{ backgroundColor: color }}
            />
        </div>
    );
}
