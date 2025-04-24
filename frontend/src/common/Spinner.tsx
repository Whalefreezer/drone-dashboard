// @deno-types="@types/react"
import React from 'react';

interface SpinnerProps {
    size?: 'small' | 'medium' | 'large';
    color?: string;
}

export default function Spinner({ size = 'medium', color = '#ffffff' }: SpinnerProps) {
    const dimensions = {
        small: { width: '16px', height: '16px' },
        medium: { width: '24px', height: '24px' },
        large: { width: '32px', height: '32px' },
    };

    const { width, height } = dimensions[size];

    return (
        <div
            style={{
                display: 'inline-block',
                width,
                height,
                border: `2px solid ${color}33`,
                borderTop: `2px solid ${color}`,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
            }}
        />
    );
}

// Add the keyframes animation to the document
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(styleSheet); 