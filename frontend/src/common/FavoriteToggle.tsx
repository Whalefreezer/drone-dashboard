import React from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { isPilotFavoriteAtom, togglePilotFavoriteAtom } from '../state/favorites-atoms.ts';

interface FavoriteToggleProps {
	/** The pilot sourceId to toggle */
	pilotSourceId: string;
	/** Additional CSS class names */
	className?: string;
	/** Whether to show the tooltip */
	showTooltip?: boolean;
	/** Custom tooltip text when favorited */
	favoritedTooltip?: string;
	/** Custom tooltip text when not favorited */
	notFavoritedTooltip?: string;
	/** Whether the button is disabled */
	disabled?: boolean;
	/** Size variant */
	size?: 'sm' | 'md' | 'lg';
}

export function FavoriteToggle({
	pilotSourceId,
	className = '',
	showTooltip = true,
	favoritedTooltip = 'Remove from favorites',
	notFavoritedTooltip = 'Add to favorites',
	disabled = false,
	size = 'md',
}: FavoriteToggleProps) {
	const [isFavorite] = useAtom(isPilotFavoriteAtom(pilotSourceId));
	const toggleFavorite = useSetAtom(togglePilotFavoriteAtom);

	// Size classes
	const sizeClasses = {
		sm: 'w-6 h-6 text-sm',
		md: 'w-8 h-8 text-base',
		lg: 'w-10 h-10 text-lg',
	};

	const baseClasses = [
		'favorite-toggle',
		'flex items-center justify-center',
		'border-none rounded-full',
		'cursor-pointer transition-all duration-200',
		'focus:outline-none focus:ring-2 focus:ring-offset-2',
		'disabled:opacity-50 disabled:cursor-not-allowed',
		sizeClasses[size],
		className,
	].filter(Boolean).join(' ');

	const tooltip = isFavorite ? favoritedTooltip : notFavoritedTooltip;

	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!disabled) {
			toggleFavorite(pilotSourceId);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			if (!disabled) {
				toggleFavorite(pilotSourceId);
			}
		}
	};

	const button = (
		<button
			type='button'
			className={baseClasses}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			disabled={disabled}
			aria-label={tooltip}
			aria-pressed={isFavorite}
			title={showTooltip ? tooltip : undefined}
		>
			<span
				className='favorite-icon'
				style={{
					display: 'block',
					transition: 'transform 0.2s ease',
					transform: isFavorite ? 'scale(1.1)' : 'scale(1)',
				}}
				aria-hidden='true'
			>
				{isFavorite ? '❤️' : '🤍'}
			</span>
		</button>
	);

	return button;
}

export default FavoriteToggle;
