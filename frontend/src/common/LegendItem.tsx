import React from 'react';

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
                return 'legend-square-fastest-overall';
            case 'var(--personal-best-color)':
                return 'legend-square-personal-best';
            default:
                return 'legend-square';
        }
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px' }}>
            <div className={getClassName()} />
            <span>{label}</span>
        </div>
    );
}

export default LegendItem;
