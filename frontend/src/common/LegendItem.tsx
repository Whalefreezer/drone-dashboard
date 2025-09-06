import React from 'react';
import './Legend.css';
import './patterns.css';

interface LegendItemProps {
	color: string;
	label: string;
}

function LegendItem({ color, label }: LegendItemProps) {
	const getClassName = () => {
		switch (color) {
			case 'var(--overall-fastest-color)':
				return 'legend-square-overall-fastest';
			case 'var(--overall-personal-best-color)':
				return 'legend-square-overall-personal-best';
			case 'var(--fastest-lap-color)':
				return 'legend-square-fastest-overall pattern-hatched';
			case 'var(--personal-best-color)':
				return 'legend-square-personal-best pattern-hatched';
			default:
				return 'legend-square';
		}
	};

	return (
		<div className='legend-item'>
			<div className={getClassName()} />
			<span>{label}</span>
		</div>
	);
}

export default LegendItem;
