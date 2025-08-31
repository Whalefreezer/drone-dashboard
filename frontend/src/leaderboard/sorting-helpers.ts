import { NullHandling, SortDirection, type Condition, type EagerGetter, type SortGroup, type ValueGetter } from './sorting-types.ts';
import { pilotConsecAtom, pilotBestLapAtom, pilotTotalLapsAtom } from './metric-factory.ts';
import { pilotPreferredChannelAtom, pilotRacesUntilNextAtom, pilotEliminatedInfoAtom } from './leaderboard-context-atoms.ts';

// Conditions
export const hasConsecutiveCurrent: Condition = (get, id) => !!get(pilotConsecAtom(id)).current;
export const hasConsecutivePrevious: Condition = (get, id) => !!get(pilotConsecAtom(id)).previous;
export const hasLaps: Condition = (get, id) => (get(pilotTotalLapsAtom(id)).current ?? 0) > 0;
export const isEliminated: Condition = (get, id) => !!get(pilotEliminatedInfoAtom(id));

// Values (current)
export const consecutiveTimeCurrent: ValueGetter = (get, id) => get(pilotConsecAtom(id)).current?.time ?? null;
export const bestLapTimeCurrent: ValueGetter = (get, id) => get(pilotBestLapAtom(id)).current?.time ?? null;

// Values (previous)
export const consecutiveTimePrevious: ValueGetter = (get, id) => get(pilotConsecAtom(id)).previous?.time ?? null;
export const bestLapTimePrevious: ValueGetter = (get, id) => get(pilotBestLapAtom(id)).previous?.time ?? null;

// Shared values
export const nextRaceDistance: ValueGetter = (get, id) => {
    const v = get(pilotRacesUntilNextAtom(id));
    if (v === -2) return -1000; // racing now → sort above 0
    if (v === -1) return Number.MAX_SAFE_INTEGER; // no upcoming → push to end
    return v;
};

export const channelNumber: ValueGetter = (get, id) => get(pilotPreferredChannelAtom(id))?.number ?? Number.MAX_SAFE_INTEGER;

export const eliminationStage: ValueGetter = (get, id) => {
    const info = get(pilotEliminatedInfoAtom(id));
    if (!info) return null;
    try {
        const bracketNum = parseInt(String(info.bracket).replace(/\D/g, ''));
        if (Number.isNaN(bracketNum)) return null;
        if (bracketNum <= 8) return 1;
        if (bracketNum <= 12) return 2;
        if (bracketNum <= 14) return 3;
        return 4;
    } catch {
        return null;
    }
};

export const eliminationPoints: ValueGetter = (get, id) => {
    const info = get(pilotEliminatedInfoAtom(id));
    return info ? info.points ?? null : null;
};

// Default configs
export const defaultSortConfigCurrent: SortGroup[] = [
    {
        name: 'Active',
        condition: (get, id) => !isEliminated(get, id),
        criteria: [],
        groups: [
            {
                name: 'With Laps',
                condition: hasLaps,
                criteria: [],
                groups: [
                    {
                        name: 'With Consecutive',
                        condition: hasConsecutiveCurrent,
                        criteria: [
                            { getValue: consecutiveTimeCurrent, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
                        ],
                    },
                    {
                        name: 'Without Consecutive',
                        condition: (get, id) => !hasConsecutiveCurrent(get, id),
                        criteria: [
                            { getValue: bestLapTimeCurrent, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
                        ],
                    },
                ],
            },
            {
                name: 'No Laps',
                condition: (get, id) => !hasLaps(get, id),
                criteria: [
                    { getValue: nextRaceDistance, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
                    { getValue: channelNumber, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
                ],
            },
        ],
    },
    {
        name: 'Eliminated',
        condition: isEliminated,
        criteria: [
            { getValue: eliminationStage, direction: SortDirection.Descending, nullHandling: NullHandling.Last },
            { getValue: eliminationPoints, direction: SortDirection.Descending, nullHandling: NullHandling.Last },
        ],
    },
    {
        name: 'Fallback',
        criteria: [
            { getValue: nextRaceDistance, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
            { getValue: channelNumber, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
        ],
    },
];

export const defaultSortConfigPrevious: SortGroup[] = [
    {
        name: 'Active',
        condition: (get, id) => !isEliminated(get, id),
        criteria: [],
        groups: [
            {
                name: 'With Laps',
                condition: hasLaps,
                criteria: [],
                groups: [
                    {
                        name: 'With Consecutive',
                        condition: hasConsecutivePrevious,
                        criteria: [
                            { getValue: consecutiveTimePrevious, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
                        ],
                    },
                    {
                        name: 'Without Consecutive',
                        condition: (get, id) => !hasConsecutivePrevious(get, id),
                        criteria: [
                            { getValue: bestLapTimePrevious, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
                        ],
                    },
                ],
            },
            {
                name: 'No Laps',
                condition: (get, id) => !hasLaps(get, id),
                criteria: [
                    { getValue: nextRaceDistance, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
                    { getValue: channelNumber, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
                ],
            },
        ],
    },
    {
        name: 'Eliminated',
        condition: isEliminated,
        criteria: [
            { getValue: eliminationStage, direction: SortDirection.Descending, nullHandling: NullHandling.Last },
            { getValue: eliminationPoints, direction: SortDirection.Descending, nullHandling: NullHandling.Last },
        ],
    },
    {
        name: 'Fallback',
        criteria: [
            { getValue: nextRaceDistance, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
            { getValue: channelNumber, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
        ],
    },
];
