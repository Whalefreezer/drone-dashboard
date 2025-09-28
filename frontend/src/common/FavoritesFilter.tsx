import React from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { favoriteCountAtom } from '../state/favorites-atoms.ts';
import { showFavoritesOnlyAtom } from '../leaderboard/leaderboard-atoms.ts';

interface FavoritesFilterProps {
	/** Additional CSS class names */
	className?: string;
}

export function FavoritesFilter({ className = '' }: FavoritesFilterProps) {
	const [showFavoritesOnly, setShowFavoritesOnly] = useAtom(showFavoritesOnlyAtom);
	const favoriteCount = useAtomValue(favoriteCountAtom);

	// Don't render the filter if there are no favorites
	if (favoriteCount === 0) {
		return null;
	}

	const baseClasses = [
		'favorites-filter',
		'display: inline-flex',
		'border: 1px solid #374151',
		'border-radius: 6px',
		'overflow: hidden',
		'background: #1f2937',
		className,
	].filter(Boolean).join(' ');

	const buttonClasses = [
		'favorites-filter-button',
		'padding: 6px 12px',
		'border: none',
		'background: transparent',
		'color: #e5e7eb',
		'cursor: pointer',
		'transition: all 0.2s ease',
		'font-size: 14px',
		'font-weight: 500',
		'white-space: nowrap',
	].join(' ');

	const activeButtonClasses = [
		buttonClasses,
		'background: #9ba3ff',
		'color: #1a1a1a',
	].join(' ');

	return (
		<div className={baseClasses}>
			<button
				type='button'
				className={!showFavoritesOnly ? activeButtonClasses : buttonClasses}
				onClick={() => setShowFavoritesOnly(false)}
				aria-pressed={!showFavoritesOnly}
			>
				All
			</button>
			<button
				type='button'
				className={showFavoritesOnly ? activeButtonClasses : buttonClasses}
				onClick={() => setShowFavoritesOnly(true)}
				aria-pressed={showFavoritesOnly}
			>
				Favorites ({favoriteCount})
			</button>
		</div>
	);
}

export default FavoritesFilter;
