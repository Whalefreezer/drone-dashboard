import { usePB } from '../api/pb.ts';
import * as pbAtoms from './pbAtoms.ts';
import * as directAtoms from './directAtoms.ts';

// Export all atoms based on usePB flag
export const eventIdAtom = usePB ? pbAtoms.eventIdAtom : directAtoms.eventIdAtom;
export const eventDataAtom = usePB ? pbAtoms.eventDataAtom : directAtoms.eventDataAtom;
export const consecutiveLapsAtom = usePB ? pbAtoms.consecutiveLapsAtom : directAtoms.consecutiveLapsAtom;
export const bracketsDataAtom = usePB ? pbAtoms.bracketsDataAtom : directAtoms.bracketsDataAtom;
export const pilotsAtom = usePB ? pbAtoms.pilotsAtom : directAtoms.pilotsAtom;
export const channelsDataAtom = usePB ? pbAtoms.channelsDataAtom : directAtoms.channelsDataAtom;
export const roundsDataAtom = usePB ? pbAtoms.roundsDataAtom : directAtoms.roundsDataAtom;
export const racesAtom = usePB ? pbAtoms.racesAtom : directAtoms.racesAtom;
export const currentRaceAtom = usePB ? pbAtoms.currentRaceAtom : directAtoms.currentRaceAtom;
export const currentRaceIdSignalAtom = usePB ? pbAtoms.currentRaceIdSignalAtom : directAtoms.currentRaceIdSignalAtom;
export const raceFamilyAtom = usePB ? pbAtoms.raceFamilyAtom : directAtoms.raceFamilyAtom;
export const updateAtom = usePB ? pbAtoms.updateAtom : directAtoms.updateAtom;
export const overallBestTimesAtom = usePB ? pbAtoms.overallBestTimesAtom : directAtoms.overallBestTimesAtom;

// Export utility functions
export const useCachedAtom = usePB ? pbAtoms.useCachedAtom : directAtoms.useCachedAtom;
export const useUpdater = usePB ? pbAtoms.useUpdater : directAtoms.useUpdater;
export const findEliminatedPilots = usePB ? pbAtoms.findEliminatedPilots : directAtoms.findEliminatedPilots;

// Export types - since both files have identical types, we can export from either
export type ProcessedLap = pbAtoms.ProcessedLap;
export type RaceWithProcessedLaps = pbAtoms.RaceWithProcessedLaps;
export type OverallBestTimes = pbAtoms.OverallBestTimes;
