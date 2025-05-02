import "../tests/global-jsdom.ts"; // Initialize JSDOM environment FIRST
import "../tests/test_setup.ts";
import { render, screen } from "@testing-library/react";
import { describe, it, beforeEach, afterEach } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import Spinner from './Spinner.tsx';


describe('Spinner', () => {
    it('renders with default props', () => {
        const { container } = render(<Spinner />);
        const spinner = container.firstChild as HTMLElement;
        
        assertEquals(spinner.style.width, '24px');  // medium size
        assertEquals(spinner.style.height, '24px');
        assertEquals(spinner.style.borderColor, 'rgba(255, 255, 255, 0.2)');
        assertEquals(spinner.style.borderTopColor, '#ffffff');
    });

    it('renders with small size', () => {
        const { container } = render(<Spinner size="small" />);
        const spinner = container.firstChild as HTMLElement;
        
        assertEquals(spinner.style.width, '16px');
        assertEquals(spinner.style.height, '16px');
    });

    it('renders with large size', () => {
        const { container } = render(<Spinner size="large" />);
        const spinner = container.firstChild as HTMLElement;
        
        assertEquals(spinner.style.width, '32px');
        assertEquals(spinner.style.height, '32px');
    });

    it('renders with custom color', () => {
        const { container } = render(<Spinner color="#ff0000" />);
        const spinner = container.firstChild as HTMLElement;
        
        assertEquals(spinner.style.borderColor, 'rgba(255, 0, 0, 0.2)');
        assertEquals(spinner.style.borderTopColor, '#ff0000');
    });

    it('applies animation styles', () => {
        const { container } = render(<Spinner />);
        const spinner = container.firstChild as HTMLElement;
        
        assertEquals(spinner.style.animation, 'spin 1s linear infinite');
    });
}); 