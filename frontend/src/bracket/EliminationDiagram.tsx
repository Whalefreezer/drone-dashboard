import './EliminationDiagram.css';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { bracketDiagramAtom } from './eliminationState.ts';
import type { BracketNodeViewModel } from './eliminationState.ts';
import { DIAGRAM_DIMENSIONS } from './doubleElimDefinition.ts';
import { currentRaceAtom } from '../race/race-atoms.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';

interface ViewportState {
	scale: number;
	x: number;
	y: number;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 1.6;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function EliminationDiagram() {
	const diagram = useAtomValue(bracketDiagramAtom);
	const currentRace = useAtomValue(currentRaceAtom);
	const containerRef = useRef<HTMLDivElement>(null);
	const pointerState = useRef<
		{
			id: number | null;
			startX: number;
			startY: number;
			originX: number;
			originY: number;
		}
	>({
		id: null,
		startX: 0,
		startY: 0,
		originX: 0,
		originY: 0,
	});

	// Calculate initial viewport based on current race
	const getInitialViewport = (): ViewportState => {
		// Find the node corresponding to the current race
		const currentNode = currentRace ? diagram.nodes.find((n) => n.race?.id === currentRace.id) : null;

		// Fallback to first node if no current race
		const targetNode = currentNode ?? diagram.nodes[0];

		if (!targetNode) {
			return { scale: 1.0, x: 80, y: 60 };
		}

		// Center on the target node
		const nodeX = targetNode.definition.position.x;
		const nodeY = targetNode.definition.position.y;
		const scale = 1.0;

		// Position so the node appears centered, biased slightly to the right
		const x = -(nodeX * scale) + 100;
		const y = -(nodeY * scale) + 200;

		return { scale, x, y };
	};

	const [viewport, setViewport] = useState<ViewportState>(getInitialViewport);
	const [isDragging, setIsDragging] = useState(false);
	const [isAtDefault, setIsAtDefault] = useState(true);

	// Track if viewport is at default position
	const checkIfAtDefault = (vp: ViewportState): boolean => {
		const initial = getInitialViewport();
		return vp.scale === initial.scale && vp.x === initial.x && vp.y === initial.y;
	};

	// Auto-follow current race when at default position
	useEffect(() => {
		if (isAtDefault) {
			const newViewport = getInitialViewport();
			setViewport(newViewport);
		}
	}, [currentRace?.id, isAtDefault]);

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		// Don't capture pointer if clicking on buttons
		if (event.target instanceof HTMLElement && event.target.tagName === 'BUTTON') {
			return;
		}
		const container = containerRef.current;
		if (!container) return;
		container.setPointerCapture(event.pointerId);
		pointerState.current = {
			id: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: viewport.x,
			originY: viewport.y,
		};
		setIsDragging(true);
		setIsAtDefault(false);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (!isDragging || pointerState.current.id !== event.pointerId) return;
		const deltaX = event.clientX - pointerState.current.startX;
		const deltaY = event.clientY - pointerState.current.startY;
		const newViewport = {
			...viewport,
			x: pointerState.current.originX + deltaX,
			y: pointerState.current.originY + deltaY,
		};
		setViewport(newViewport);
		setIsAtDefault(checkIfAtDefault(newViewport));
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
		if (pointerState.current.id !== event.pointerId) return;
		const container = containerRef.current;
		if (container?.hasPointerCapture(event.pointerId)) {
			container.releasePointerCapture(event.pointerId);
		}
		pointerState.current.id = null;
		setIsDragging(false);
	};

	const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		const container = containerRef.current;
		if (!container) return;
		const rect = container.getBoundingClientRect();
		const offsetX = (event.clientX - rect.left - viewport.x) / viewport.scale;
		const offsetY = (event.clientY - rect.top - viewport.y) / viewport.scale;
		const scaleDelta = event.deltaY > 0 ? 0.9 : 1.1;
		setViewport((prev) => {
			const newScale = clamp(prev.scale * scaleDelta, MIN_SCALE, MAX_SCALE);
			const newX = event.clientX - rect.left - offsetX * newScale;
			const newY = event.clientY - rect.top - offsetY * newScale;
			const newViewport = { scale: newScale, x: newX, y: newY };
			setIsAtDefault(checkIfAtDefault(newViewport));
			return newViewport;
		});
	};

	const handleReset = () => {
		const initialViewport = getInitialViewport();
		pointerState.current = {
			id: null,
			startX: 0,
			startY: 0,
			originX: initialViewport.x,
			originY: initialViewport.y,
		};
		setIsDragging(false);
		setViewport(initialViewport);
		setIsAtDefault(true);
	};

	const stageTransform = {
		transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
		transformOrigin: '0 0',
	};

	const edgePaths = useMemo(() => {
		return diagram.edges
			.filter((edge) => edge.definition.type === 'advance')
			.map((edge) => {
				const source = edge.source.definition.position;
				const target = edge.target.definition.position;
				const startX = source.x + DIAGRAM_DIMENSIONS.nodeWidth;
				const startY = source.y + DIAGRAM_DIMENSIONS.nodeHeight / 2;
				const endX = target.x;
				const endY = target.y + DIAGRAM_DIMENSIONS.nodeHeight / 2;
				const midX = startX + (endX - startX) * 0.5;
				const path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;
				return { edge, d: path };
			});
	}, [diagram.edges]);

	return (
		<div
			ref={containerRef}
			className='elim-diagram-container'
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onWheel={handleWheel}
			role='presentation'
		>
			<div className='elim-diagram-toolbar'>
				<div className='elim-diagram-controls'>
					{!isAtDefault && (
						<>
							<button type='button' className='elim-reset-btn' onClick={handleReset}>
								Reset view
							</button>
							<div className='elim-diagram-zoom'>
								<span>{Math.round(viewport.scale * 100)}%</span>
							</div>
						</>
					)}
				</div>
			</div>
			<div className='elim-diagram-stage' style={stageTransform}>
				<svg
					className='elim-diagram-svg'
					width={DIAGRAM_DIMENSIONS.width}
					height={DIAGRAM_DIMENSIONS.height}
					viewBox={`0 0 ${DIAGRAM_DIMENSIONS.width} ${DIAGRAM_DIMENSIONS.height}`}
					role='img'
					aria-label='Double elimination bracket'
				>
					<defs>
						<filter id='shadow' x='-20%' y='-20%' width='140%' height='140%'>
							<feDropShadow
								dx='0'
								dy='4'
								stdDeviation='6'
								floodColor='rgba(0,0,0,0.2)'
							/>
						</filter>
					</defs>
					<g className='elim-edges'>
						{edgePaths.map(({ edge, d }) => (
							<path
								key={`${edge.definition.from}-${edge.definition.to}-${edge.definition.type}`}
								d={d}
								className={`elim-edge elim-edge--${edge.definition.type}`}
								data-state={edge.state}
								fill='none'
								pointerEvents='none'
							/>
						))}
					</g>
					<g className='elim-nodes'>
						{diagram.nodes.map((node) => renderNode(node, currentRace))}
					</g>
				</svg>
			</div>
		</div>
	);
}

function renderNode(node: BracketNodeViewModel, currentRace: PBRaceRecord | null) {
	const { definition } = node;
	const isCurrentRace = currentRace && node.race?.id === currentRace.id;
	return (
		<g
			key={definition.order}
			className='elim-node'
			transform={`translate(${definition.position.x} ${definition.position.y})`}
		>
			<rect
				x={0}
				y={0}
				rx={12}
				ry={12}
				width={DIAGRAM_DIMENSIONS.nodeWidth}
				height={DIAGRAM_DIMENSIONS.nodeHeight}
				className='elim-node-rect'
				data-status={node.status}
				data-current={isCurrentRace ? 'true' : 'false'}
				filter='url(#shadow)'
			/>
			<foreignObject
				x={0}
				y={0}
				width={DIAGRAM_DIMENSIONS.nodeWidth}
				height={DIAGRAM_DIMENSIONS.nodeHeight}
			>
				<div className='elim-node-card' data-status={node.status}>
					<header>
						<div className='elim-node-title'>{node.headline}</div>
						<div className='elim-node-sub'>{node.subline}</div>
					</header>
					<ul>
						{node.slots.map((slot) => (
							<li
								key={slot.id}
								className='elim-node-slot'
								data-winner={slot.isWinner ? 'true' : 'false'}
								data-eliminated={slot.isEliminated ? 'true' : 'false'}
								data-predicted={slot.isPredicted ? 'true' : 'false'}
							>
								<span className='slot-position'>{slot.position ?? '–'}</span>
								<span className='slot-channel'>{slot.channelLabel}</span>
								<span className='slot-name' title={slot.name}>{slot.name}</span>
							</li>
						))}
					</ul>
					{node.dropToLabel && (
						<div className='elim-node-footer'>
							{node.dropToLabel}
						</div>
					)}
				</div>
			</foreignObject>
		</g>
	);
}
