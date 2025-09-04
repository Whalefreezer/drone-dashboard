import React, { useEffect, useRef, useState } from 'react';

export function OverflowFadeCell(
    { children, className = '', title }: { children: React.ReactNode; className?: string; title?: string },
) {
    const [hasOverflow, setHasOverflow] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const checkOverflow = () => {
            if (ref.current) {
                const { scrollWidth, clientWidth } = ref.current;
                setHasOverflow(scrollWidth > clientWidth);
            }
        };
        checkOverflow();
        globalThis.addEventListener('resize', checkOverflow);
        return () => globalThis.removeEventListener('resize', checkOverflow);
    }, [children]);

    return (
        <div ref={ref} className={[className, hasOverflow ? 'fade-overflow' : ''].filter(Boolean).join(' ')} title={title}>
            {children}
        </div>
    );
}

