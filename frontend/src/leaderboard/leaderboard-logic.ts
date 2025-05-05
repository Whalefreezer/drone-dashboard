import {
    BestTime,
    ConsecutiveTime,
    calculateBestTimes,
    CONSECUTIVE_LAPS,
} from '../race/race-utils.ts';
import {
    calculateRacesUntilNext,
    findIndexOfCurrentRace,
    getEliminationOrderIndex,
    getNormalizedPilotName,
    isPilotEliminated,
    isPilotInEliminationOrder,
    pilotHasConsecutiveLaps,
    pilotHasLaps,
    getEliminationStage,
} from '../common/utils.ts';
import { Pilot, Channel } from '../types/index.ts';
import {
    findEliminatedPilots,
    RaceWithProcessedLaps,
} from '../state/atoms.ts';
import { Bracket } from '../bracket/bracket-types.ts';
import {
    LeaderboardEntry,
    SortDirection,
    NullHandling,
    SortGroup,
} from './leaderboard-types.ts';
import { EliminatedPilot } from '../bracket/bracket-types.ts';

// Logic functions (calculations, sorting) for the Leaderboard feature

// --- Calculation Logic (from atoms.ts) --- 


export function calculateLeaderboardData(
    races: RaceWithProcessedLaps[],
    pilots: Pilot[],
    channels: Channel[],
    currentRaceIndex: number,
    brackets: Bracket[] = [],
): LeaderboardEntry[] {
    // Calculate best times
    const { overallFastestLaps, fastestConsecutiveLaps, fastestHoleshots } =
        calculateBestTimes(races);

    // Get pilots that are explicitly listed in race PilotChannels
    const scheduledPilots = new Set<string>();
    races.forEach((race) => {
        race.PilotChannels.forEach((pc) => {
            scheduledPilots.add(pc.Pilot);
        });
    });

    // Calculate races until next race for each pilot (still needed for LeaderboardEntry)
    const racesUntilNextMap = new Map<string, number>();
    if (currentRaceIndex >= 0 && currentRaceIndex < races.length) {
        pilots.forEach((pilot) => {
            racesUntilNextMap.set(
                pilot.ID,
                calculateRacesUntilNext(races, currentRaceIndex, pilot.ID),
            );
        });
    }

    // Calculate total laps for each pilot
    const totalLaps = new Map<string, number>();
    races.forEach((race) => {
        race.processedLaps.forEach((lap) => {
            if (!lap.isHoleshot) {
                totalLaps.set(lap.pilotId, (totalLaps.get(lap.pilotId) || 0) + 1);
            }
        });
    });

    // Get eliminated pilots information
    const eliminatedPilots = findEliminatedPilots(brackets);

    // Create pilot entries only for pilots in races
    const pilotEntries = pilots
        .filter((pilot) => scheduledPilots.has(pilot.ID))
        .map((pilot) => {
            // Find if this pilot is eliminated
            const eliminatedInfo = eliminatedPilots.find(
                (ep) =>
                    ep.name.toLowerCase().replace(/\s+/g, '') ===
                        pilot.Name.toLowerCase().replace(/\s+/g, ''),
            );

            // Get the pilot's channel using the extracted function
            const pilotChannel = getPilotChannelWithPriority(
                pilot.ID,
                races,
                channels,
                currentRaceIndex,
            );

            return {
                pilot,
                bestLap: overallFastestLaps.get(pilot.ID) || null,
                consecutiveLaps: fastestConsecutiveLaps.get(pilot.ID) || null,
                bestHoleshot: fastestHoleshots.get(pilot.ID) || null,
                channel: pilotChannel,
                racesUntilNext: racesUntilNextMap.get(pilot.ID) ?? -1,
                totalLaps: totalLaps.get(pilot.ID) ?? 0,
                eliminatedInfo: eliminatedInfo
                    ? {
                        bracket: eliminatedInfo.bracket,
                        position: eliminatedInfo.position,
                        points: eliminatedInfo.points,
                    }
                    : null,
            };
        });

    return sortLeaderboard(pilotEntries, defaultLeaderboardSortConfig);
}

function findChannelById(channels: Channel[], channelId: string | undefined): Channel | null {
    if (!channelId) return null;
    return channels.find((c) => c.ID === channelId) || null;
}

function getPilotChannelIdInRace(race: RaceWithProcessedLaps | undefined, pilotId: string): string | undefined {
    return race?.PilotChannels.find((pc) => pc.Pilot === pilotId)?.Channel;
}

export function getPilotChannelWithPriority(
    pilotId: string,
    races: RaceWithProcessedLaps[],
    channels: Channel[],
    currentRaceIndex: number,
): Channel | null {
    const currentAndFutureRaces = races.slice(currentRaceIndex);
    const pastRacesReversed = races.slice(0, currentRaceIndex).reverse();

    const prioritizedRaces = [
        ...currentAndFutureRaces,
        ...pastRacesReversed,
    ];

    // Find the first race in the prioritized list where the pilot exists
    const raceWithPilot = prioritizedRaces.find(race => getPilotChannelIdInRace(race, pilotId) !== undefined);

    const foundChannelId = getPilotChannelIdInRace(raceWithPilot, pilotId);

    // Look up the Channel object for the found ID
    return findChannelById(channels, foundChannelId);
}


export function getPositionChanges(
    currentPositions: LeaderboardEntry[],
    previousPositions: LeaderboardEntry[],
): Map<string, number> {
    const changes = new Map<string, number>();
    const previousPositionMap = new Map<string, number>();

    // Map previous positions for quick lookup
    previousPositions.forEach((entry, index) => {
        if (entry.consecutiveLaps || entry.bestLap) { // Only consider pilots with times
            previousPositionMap.set(entry.pilot.ID, index + 1);
        }
    });

    currentPositions.forEach((entry, currentIndex) => {
        // Only consider pilots with times in the current leaderboard
        if (entry.consecutiveLaps || entry.bestLap) {
            const previousIndexPlusOne = previousPositionMap.get(entry.pilot.ID);
            if (previousIndexPlusOne !== undefined && previousIndexPlusOne !== currentIndex + 1) {
                changes.set(entry.pilot.ID, previousIndexPlusOne); // Store previous 1-based position
            }
        }
    });

    return changes;
}

// --- Sorting Logic (from race-utils.ts) --- 

// Main sorting function
export function sortLeaderboard(
    entries: LeaderboardEntry[],
    config: SortGroup[],
): LeaderboardEntry[] {
    // Create a copy before sorting to avoid mutating the original array
    return [...entries].sort((a, b) => {
        const hierarchyA = getGroupHierarchy(a, config);
        const hierarchyB = getGroupHierarchy(b, config);

        // Compare hierarchies level by level based on natural array order
        const minDepth = Math.min(hierarchyA.length, hierarchyB.length);
        for (let i = 0; i < minDepth; i++) {
            const parentGroups = (i === 0) ? config : hierarchyA[i - 1]?.groups;
            if (!parentGroups) break; // Should not happen with valid hierarchy

            const indexA = parentGroups.findIndex((group) => group === hierarchyA[i]);
            const indexB = parentGroups.findIndex((group) => group === hierarchyB[i]);

            if (indexA !== indexB) {
                return indexA - indexB; // Sort by natural group order
            }
        }

        // If hierarchies are identical up to the shorter length, the deeper one comes later
        if (hierarchyA.length !== hierarchyB.length) {
            return hierarchyA.length - hierarchyB.length;
        }

        // If hierarchies are identical, compare using criteria of the most specific group
        const mostSpecificGroup = hierarchyA[hierarchyA.length - 1];
        if (!mostSpecificGroup) return 0; // Should have at least one group if hierarchies match

        for (const criteria of mostSpecificGroup.criteria) {
            const aValue = criteria.getValue(a);
            const bValue = criteria.getValue(b);

            // Handle null values based on NullHandling strategy
            if (aValue === null && bValue === null) continue;
            if (aValue === null) {
                return criteria.nullHandling === NullHandling.First ? -1 : 1;
            }
            if (bValue === null) {
                return criteria.nullHandling === NullHandling.First ? 1 : -1;
            }

            // Compare non-null values
            const comparison = aValue - bValue;
            if (comparison !== 0) {
                return criteria.direction === SortDirection.Ascending ? comparison : -comparison;
            }
        }

        return 0; // Entries are identical according to all criteria in the group
    });
}

// Helper function to find the hierarchy of applicable groups for an entry
function getGroupHierarchy(
    entry: LeaderboardEntry,
    groups: SortGroup[],
): SortGroup[] {
    const hierarchy: SortGroup[] = [];
    function findPath(currentGroups: SortGroup[]): boolean {
        for (const group of currentGroups) {
            if (!group.condition || group.condition(entry)) {
                hierarchy.push(group);
                if (group.groups && group.groups.length > 0) {
                    if (findPath(group.groups)) {
                        return true; // Found the deepest path
                    }
                }
                return true;
            }
        }
        hierarchy.pop(); // Backtrack
        return false;
    }
    findPath(groups);
    return hierarchy;
}

// Default sorting configuration using helper functions
export const defaultLeaderboardSortConfig: SortGroup[] = [
    {
        name: 'Active Pilots',
        criteria: [],
        groups: [
            {
                name: 'Elimination Order',
                condition: isPilotInEliminationOrder,
                criteria: [
                    {
                        getValue: (entry) => getEliminationOrderIndex(entry.pilot.Name),
                        direction: SortDirection.Ascending,
                        nullHandling: NullHandling.Last,
                    },
                ],
            },
            {
                name: 'Pilots with Laps',
                condition: pilotHasLaps,
                criteria: [],
                groups: [
                    {
                        name: 'Pilots with Consecutive Laps',
                        condition: pilotHasConsecutiveLaps,
                        criteria: [
                            {
                                getValue: (entry) => entry.consecutiveLaps?.time ?? null,
                                direction: SortDirection.Ascending,
                                nullHandling: NullHandling.Last,
                            },
                        ],
                    },
                    {
                        name: 'Pilots without Consecutive Laps',
                        condition: (entry) => !pilotHasConsecutiveLaps(entry),
                        criteria: [
                            {
                                getValue: (entry) => entry.bestLap?.time ?? null,
                                direction: SortDirection.Ascending,
                                nullHandling: NullHandling.Last,
                            },
                        ],
                    },
                ],
            },
            {
                name: 'Pilots without Laps',
                condition: (entry) => !pilotHasLaps(entry),
                criteria: [
                    {
                        getValue: (entry) =>
                            entry.racesUntilNext === -1
                                ? Number.MAX_SAFE_INTEGER
                                : entry.racesUntilNext,
                        direction: SortDirection.Ascending,
                        nullHandling: NullHandling.Last,
                    },
                    {
                        getValue: (entry) => entry.channel?.Number ?? null,
                        direction: SortDirection.Ascending,
                        nullHandling: NullHandling.Last,
                    },
                ],
            },
        ],
    },
    {
        name: 'Eliminated Pilots',
        condition: isPilotEliminated,
        criteria: [
            {
                getValue: getEliminationStage,
                direction: SortDirection.Descending,
                nullHandling: NullHandling.Last,
            },
            {
                getValue: (entry) => entry.eliminatedInfo?.points ?? null,
                direction: SortDirection.Descending,
                nullHandling: NullHandling.Last,
            },
        ],
        groups: [
            { name: 'Eliminated in Finals', condition: (e) => getEliminationStage(e) === 4, criteria: [] },
            { name: 'Eliminated in Semis', condition: (e) => getEliminationStage(e) === 3, criteria: [] },
            { name: 'Eliminated in Quarters', condition: (e) => getEliminationStage(e) === 2, criteria: [] },
            { name: 'Eliminated in Heats', condition: (e) => getEliminationStage(e) === 1, criteria: [] },
        ],
    },
    {
        name: 'Default Sort',
        criteria: [
            {
                getValue: (entry) =>
                    entry.racesUntilNext === -1 ? Number.MAX_SAFE_INTEGER : entry.racesUntilNext,
                direction: SortDirection.Ascending,
                nullHandling: NullHandling.Last,
            },
            {
                getValue: (entry) => entry.channel?.Number ?? null,
                direction: SortDirection.Ascending,
                nullHandling: NullHandling.Last,
            },
        ],
    },
]; 