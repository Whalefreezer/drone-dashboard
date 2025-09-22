import { QRCodeSVG } from 'qrcode.react';

// Define the core props we expect to use
interface CoreQRCodeProps {
	value: string;
	size?: number;
	bgColor?: string;
	fgColor?: string;
	level?: 'L' | 'M' | 'Q' | 'H';
	style?: React.CSSProperties;
	// Add other props from qrcode.react if needed
}

// Sensible defaults, can be overridden by props
const defaultProps: Partial<CoreQRCodeProps> = {
	size: 128,
	bgColor: '#FFFFFF',
	fgColor: '#000000',
	level: 'L',
	style: { backgroundColor: '#FFF', padding: '8px', borderRadius: '4px' },
};

// Our component's props: requires 'value', allows overrides
type QRCodeProps =
	& Required<Pick<CoreQRCodeProps, 'value'>>
	& Partial<Omit<CoreQRCodeProps, 'value'>>;

// Wrapper component for QRCodeSVG
function QRCode({ value, ...rest }: QRCodeProps) {
	const combinedProps: React.ComponentProps<typeof QRCodeSVG> = { ...defaultProps, ...rest, value } as React.ComponentProps<
		typeof QRCodeSVG
	>;

	return (
		<div className='qr-code-container'>
			<QRCodeSVG {...combinedProps} />
		</div>
	);
}

export default QRCode;
