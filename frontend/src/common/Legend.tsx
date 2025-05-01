import React from 'react';
import LegendItem from './LegendItem.tsx'; // Ensure correct path

function Legend() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '8px',
        backgroundColor: '#222',
        borderRadius: '4px',
        marginBottom: '16px',
        width: 'fit-content',
      }}
    >
      <LegendItem color='var(--overall-fastest-color)' label='Overall Fastest' />
      <LegendItem color='var(--overall-personal-best-color)' label='Overall Personal Best' />
      <LegendItem color='var(--fastest-lap-color)' label='Race Fastest' />
      <LegendItem color='var(--personal-best-color)' label='Race Personal Best' />
    </div>
  );
}

export default Legend; 