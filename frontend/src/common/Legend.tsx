import React from 'react';
import LegendItem from './LegendItem.tsx'; // Ensure correct path
import './Legend.css';

function Legend() {
	return (
		<div className='legend-container'>
			<LegendItem color='var(--overall-fastest-color)' label='Overall Best' />
			<LegendItem color='var(--overall-personal-best-color)' label='Overall PB' />
			<LegendItem color='var(--fastest-lap-color)' label='Race Best' />
			<LegendItem color='var(--personal-best-color)' label='Race PB' />
		</div>
	);
}

export default Legend;
