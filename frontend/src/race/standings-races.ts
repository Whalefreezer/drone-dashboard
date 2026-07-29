import { EventType, type PBRaceRecord, type PBRoundRecord } from '../api/pbTypes.ts';

/**
 * Round event types that exist for tuning rather than competition.
 *
 * A race day usually opens with practice rounds so pilots can dial in their
 * drones and the timing system thresholds can be calibrated. Those laps are
 * deliberately messy, so they must not feed the standings.
 */
const NON_COMPETITIVE_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
	EventType.Practice,
	EventType.CasualPractice,
]);

export function isNonCompetitiveRound(round: PBRoundRecord): boolean {
	return round.eventType != null && NON_COMPETITIVE_EVENT_TYPES.has(round.eventType);
}

/**
 * Drops races belonging to a practice round.
 *
 * Races whose round is missing from `rounds` are kept: an unknown round is far
 * more likely to be an ingest lag than a practice round, and silently dropping
 * real results is much worse than briefly counting a practice lap.
 */
export function selectStandingsRaces(races: PBRaceRecord[], rounds: PBRoundRecord[]): PBRaceRecord[] {
	const nonCompetitiveRoundIds = new Set(rounds.filter(isNonCompetitiveRound).map((round) => round.id));
	if (nonCompetitiveRoundIds.size === 0) return races;
	return races.filter((race) => !nonCompetitiveRoundIds.has(race.round ?? ''));
}
