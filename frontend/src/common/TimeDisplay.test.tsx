import '../tests/test_setup.ts';
import { assertEquals } from '@std/assert';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';
import TimeDisplay from './TimeDisplay.tsx';

describe('TimeDisplay', () => {
    let originalDate: DateConstructor;
    const mockDate = new Date('2024-03-20T14:30:00');

    beforeEach(() => {
        originalDate = globalThis.Date;
        globalThis.Date = class extends Date {
            constructor() {
                super();
                return mockDate;
            }
        } as DateConstructor;
    });

    afterEach(() => {
        globalThis.Date = originalDate;
        cleanup();
    });

    it('renders 12-hour time format by default', () => {
        const { container } = render(<TimeDisplay />);
        assertEquals(container.textContent, '2:30 PM');
    });

    it('renders 24-hour time format when specified', () => {
        const { container } = render(<TimeDisplay format='24h' />);
        assertEquals(container.textContent, '14:30');
    });

    it('shows seconds when showSeconds is true', () => {
        const { container } = render(<TimeDisplay showSeconds={true} />);
        assertEquals(container.textContent, '2:30:00 PM');
    });

    it('applies default styles', () => {
        const { container } = render(<TimeDisplay />);
        const timeDisplay = container.firstChild as HTMLElement;

        assertEquals(timeDisplay.style.textAlign, 'center');
        assertEquals(timeDisplay.style.padding, '0.5rem');
        assertEquals(timeDisplay.style.borderBottom, '1px solid #333');
        assertEquals(timeDisplay.style.backgroundColor, 'rgb(26, 26, 26)');
    });

    it('allows style overrides', () => {
        const customStyle = { backgroundColor: 'red', color: 'white' };
        const { container } = render(<TimeDisplay style={customStyle} />);
        const timeDisplay = container.firstChild as HTMLElement;

        assertEquals(timeDisplay.style.backgroundColor, 'red');
        assertEquals(timeDisplay.style.color, 'white');
        // Default styles should still be present
        assertEquals(timeDisplay.style.textAlign, 'center');
        assertEquals(timeDisplay.style.padding, '0.5rem');
    });
});
