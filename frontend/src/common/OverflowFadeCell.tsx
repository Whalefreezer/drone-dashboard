import React, { useEffect, useRef, useState } from 'react';

export function OverflowFadeCell(
	{ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string },
) {
	const [hasOverflow, setHasOverflow] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let raf = 0;
		const checkOverflow = () => {
			raf = globalThis.requestAnimationFrame(() => {
				if (ref.current) {
					const { scrollWidth, clientWidth } = ref.current;
					const next = scrollWidth > clientWidth;
					setHasOverflow((prev) => (prev === next ? prev : next));
				}
			});
		};
		checkOverflow();
		globalThis.addEventListener('resize', checkOverflow);
		return () => {
			globalThis.cancelAnimationFrame(raf);
			globalThis.removeEventListener('resize', checkOverflow);
		};
	}, [children]);

	return (
		<div ref={ref} className={[className, hasOverflow ? 'fade-overflow' : ''].filter(Boolean).join(' ')} title={title}>
			{children}
		</div>
	);
}
