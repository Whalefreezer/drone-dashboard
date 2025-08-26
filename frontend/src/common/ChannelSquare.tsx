import React from 'react';
import { useAtomValue } from 'jotai';
import { channelsDataAtom } from '../state/index.ts';
import './ChannelSquare.css';
// import './ChannelSquare.css';

interface ChannelSquareProps {
    channelID: string;
    change?: boolean;
}

export function ChannelSquare(
    { channelID, change }: ChannelSquareProps,
) {
    const channels = useAtomValue(channelsDataAtom);
    const channel = channels.find((c) => c.sourceId === channelID);
    const color = channel?.channelColor ?? '#888';

    return (
        <div
            className='channel-square'
            style={{ backgroundColor: color }}
        >
            {change ? '!' : ''}
        </div>
    );
}
