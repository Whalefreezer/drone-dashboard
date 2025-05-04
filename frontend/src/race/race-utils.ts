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
import { LeaderboardEntry, SortGroup, SortDirection, NullHandling } from '../leaderboard/leaderboard-types.ts';

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
