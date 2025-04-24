// @deno-types="@types/react"
import { useEffect, useState } from 'react';

export default function TimeDisplay() {
    const [currentTime, setCurrentTime] = useState('');

    useEffect(() => {
        const updateTime = () => {
            const time = new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            });
            setCurrentTime(time);
        };

        updateTime(); // Initial update
        const timer = setInterval(updateTime, 1000); // Update every second

        return () => clearInterval(timer); // Cleanup
    }, []);

    return (
        <div
            style={{
                textAlign: 'center',
                padding: '0.5rem',
                borderBottom: '1px solid #333',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: '#1a1a1a',
                zIndex: 100,
            }}
        >
            {currentTime}
        </div>
    );
} 