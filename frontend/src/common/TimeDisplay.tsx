import React, { useEffect, useState } from 'react';

interface TimeDisplayProps {
	/** Format for displaying the time. Defaults to '12h' */
	format?: '12h' | '24h';
	/** Whether to show seconds. Defaults to false */
	showSeconds?: boolean;
	/** Custom style object for the container */
	style?: React.CSSProperties;
}

export default function TimeDisplay({
	format = '12h',
	showSeconds = false,
	style,
}: TimeDisplayProps) {
	const [currentTime, setCurrentTime] = useState('');

	useEffect(() => {
		const updateTime = () => {
			const time = new Date().toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit',
				second: showSeconds ? '2-digit' : undefined,
				hour12: format === '12h',
			});
			setCurrentTime(time);
		};

		updateTime(); // Initial update
		const timer = setInterval(updateTime, 1000); // Update every second

		return () => clearInterval(timer); // Cleanup
	}, [format, showSeconds]);

	return (
		<div
			style={{
				textAlign: 'center',
				padding: '0.5rem',
				borderBottom: '1px solid #333',
				backgroundColor: '#1a1a1a',
				...style,
			}}
		>
			{currentTime}
		</div>
	);
}
