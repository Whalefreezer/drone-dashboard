import React from 'react';
import { useQueryAtom } from '../../state/index.ts';
import { eventDataAtom } from '../../state/index.ts';
import './ChannelSquare.css';
// import './ChannelSquare.css';

interface ChannelSquareProps {
    channelID: string;
    change?: boolean;
}

export function ChannelSquare(
    { channelID, change }: ChannelSquareProps,
) {
    const eventData = useQueryAtom(eventDataAtom);

    const colorIndex = eventData?.[0]?.Channels?.indexOf(channelID);
    const color = (eventData?.[0]?.ChannelColors && colorIndex !== undefined && colorIndex > -1)
        ? eventData[0].ChannelColors[colorIndex]
        : '#888';

    return (
        <div
            className='channel-square'
            style={{ backgroundColor: color }}
        >
            {change ? '!' : ''}
        </div>
    );
} 