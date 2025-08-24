import { useAtomValue } from 'jotai';
import { channelsDataAtom, eventDataAtom, pilotsAtom, useQueryAtom } from '../state/index.ts';
import { PilotChannelViewProps } from './pilot-types.ts';

export function PilotChannelView({ pilotChannel }: PilotChannelViewProps) {
    const pilots = useQueryAtom(pilotsAtom);
    const channels = useAtomValue(channelsDataAtom);
    const { data: eventData } = useAtomValue(eventDataAtom);

    const pilot = pilots.find((p) => p.ID === pilotChannel.Pilot)!;
    const channel = channels.find((c) => c.ID === pilotChannel.Channel)!;

    const colorIndex = eventData?.[0]?.Channels?.indexOf(pilotChannel.Channel);
    const color = (eventData?.[0]?.ChannelColors && colorIndex !== undefined && colorIndex > -1)
        ? eventData[0].ChannelColors[colorIndex]
        : '#888';

    return (
        <div className='pilot-channel'>
            <div className='pilot-info'>
                {pilot.Name} {channel.ShortBand}
                {channel.Number}
            </div>
            <div
                className='color-indicator'
                style={{ backgroundColor: color }}
            />
        </div>
    );
}
