import React from 'react';
import LegendItem from './LegendItem.tsx'; // Ensure correct path
import './Legend.css';

function Legend() {
    return (
        <div className="legend-container">
            <LegendItem color='var(--overall-fastest-color)' label='Overall Fastest' />
            <LegendItem color='var(--overall-personal-best-color)' label='Overall Personal Best' />
            <LegendItem color='var(--fastest-lap-color)' label='Race Fastest' />
            <LegendItem color='var(--personal-best-color)' label='Race Personal Best' />
        </div>
    );
}

export default Legend;
