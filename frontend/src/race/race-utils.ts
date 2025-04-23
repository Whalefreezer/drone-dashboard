import { LeaderboardEntry } from '../state/atoms.ts';
import { secondsFromString } from '../common/utils.ts';
import {
    getEliminationOrderIndex,
    getEliminationStage,
    getNormalizedPilotName,
    isPilotEliminated,
    isPilotInEliminationOrder,
    pilotHasConsecutiveLaps,
    pilotHasLaps,
} from '../common/utils.ts';
import { RaceWithProcessedLaps } from '../state/index.ts';
import { PilotLapData } from './race-types.ts';
import { RoundData } from './race-types.ts';

export enum SortDirection {
    Ascending = 'asc',
    Descending = 'desc',
}

export enum NullHandling {
    First = 'NULLS_FIRST',
    Last = 'NULLS_LAST',
    Exclude = 'EXCLUDE',
}

export interface SortCriteria {
    getValue: (entry: LeaderboardEntry) => number | null;
    direction: SortDirection;
    nullHandling: NullHandling;
}

export interface SortGroup {
    name: string;
    criteria: SortCriteria[];
    condition?: (entry: LeaderboardEntry) => boolean;
    groups?: SortGroup[]; // Nested groups
}

// Main sorting function
export function sortLeaderboard(
    entries: LeaderboardEntry[],
    config: SortGroup[],
): LeaderboardEntry[] {
    return entries.sort((a, b) => {
        const hierarchyA = getGroupHierarchy(a, config);
        const hierarchyB = getGroupHierarchy(b, config);

        // Compare hierarchies level by level based on natural array order
        const minDepth = Math.min(hierarchyA.length, hierarchyB.length);
        for (let i = 0; i < minDepth; i++) {
            const parentGroups = (i === 0) ? config : hierarchyA[i - 1].groups;
            if (!parentGroups) break; // Should not happen with valid hierarchy

            const indexA = parentGroups.findIndex((group) => group === hierarchyA[i]);
            const indexB = parentGroups.findIndex((group) => group === hierarchyB[i]);

            if (indexA !== indexB) {
                return indexA - indexB; // Sort by natural group order
            }
        }

        // If hierarchies are identical up to the shorter length, the deeper one comes later (though this case is less common)
        if (hierarchyA.length !== hierarchyB.length) {
            return hierarchyA.length - hierarchyB.length;
        }

        // If hierarchies are identical, compare using criteria of the most specific group
        const mostSpecificGroup = hierarchyA[hierarchyA.length - 1];
        if (!mostSpecificGroup) return 0; // Should have at least one group if hierarchies match

        for (const criteria of mostSpecificGroup.criteria) {
            const aValue = criteria.getValue(a);
            const bValue = criteria.getValue(b);

            // Handle null values
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
                // If no deeper path found or no subgroups, this is the path
                return true;
            }
        }
        // No applicable group found at this level
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
                        // Inverse condition
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
                // Inverse condition
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
                direction: SortDirection.Descending, // Higher stage number (later stage) comes first
                nullHandling: NullHandling.Last,
            },
            {
                getValue: (entry) => entry.eliminatedInfo?.points ?? null,
                direction: SortDirection.Descending,
                nullHandling: NullHandling.Last,
            },
        ],
        groups: [
            {
                name: 'Eliminated in Finals',
                condition: (entry) => getEliminationStage(entry) === 4,
                criteria: [],
            },
            {
                name: 'Eliminated in Semis',
                condition: (entry) => getEliminationStage(entry) === 3,
                criteria: [],
            },
            {
                name: 'Eliminated in Quarters',
                condition: (entry) => getEliminationStage(entry) === 2,
                criteria: [],
            },
            {
                name: 'Eliminated in Heats',
                condition: (entry) => getEliminationStage(entry) === 1,
                criteria: [],
            },
        ],
    },
    {
        name: 'Default Sort', // Catch-all for any pilots not meeting other conditions
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

export function calculatePilotsWithLaps(race: RaceWithProcessedLaps): PilotLapData[] {
    return race.PilotChannels.map((pilotChannel) => {
        const completedLaps = race.processedLaps.filter((lap) =>
            lap.pilotId === pilotChannel.Pilot
        ).length;
        return { pilotChannel, completedLaps };
    }).sort((a, b) => b.completedLaps - a.completedLaps);
}

export function normalizeString(str: string): string {
    return str.toLowerCase().replace(/\s+/g, '');
}
