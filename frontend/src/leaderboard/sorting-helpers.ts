import {
    type Condition,
    NullHandling,
    SortDirection,
    type SortGroup,
    type ValueGetter,
} from './sorting-types.ts';
import { pilotBestLapAtom, pilotConsecAtom, pilotTotalLapsAtom } from './metric-factory.ts';
import {
    pilotEliminatedInfoAtom,
    pilotPreferredChannelAtom,
    pilotRacesUntilNextAtom,
} from './leaderboard-context-atoms.ts';

export type MetricScope = 'current' | 'previous';

// Conditions
export const hasConsecutive = (scope: MetricScope): Condition => (get, id) =>
    !!get(pilotConsecAtom(id))[scope];
export const hasLaps: Condition = (get, id) => (get(pilotTotalLapsAtom(id)).current ?? 0) > 0;
export const isEliminated: Condition = (get, id) => !!get(pilotEliminatedInfoAtom(id));

// Values parameterized by scope
export const consecutiveTime = (scope: MetricScope): ValueGetter => (get, id) =>
    get(pilotConsecAtom(id))[scope]?.time ?? null;
export const bestLapTime = (scope: MetricScope): ValueGetter => (get, id) =>
    get(pilotBestLapAtom(id))[scope]?.time ?? null;

// Shared values
export const nextRaceDistance: ValueGetter = (get, id) => {
    const v = get(pilotRacesUntilNextAtom(id));
    if (v === -2) return -1000; // racing now → sort above 0
    if (v === -1) return Number.MAX_SAFE_INTEGER; // no upcoming → push to end
    return v;
};

export const channelNumber: ValueGetter = (get, id) =>
    get(pilotPreferredChannelAtom(id))?.number ?? Number.MAX_SAFE_INTEGER;

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

// Config factory producing a config per scope
export function createDefaultSortConfig(scope: MetricScope): SortGroup[] {
    const hasConsec = hasConsecutive(scope);
    const consecValue = consecutiveTime(scope);
    const bestLapValue = bestLapTime(scope);

    return [
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
                            condition: hasConsec,
                            criteria: [
                                {
                                    getValue: consecValue,
                                    direction: SortDirection.Ascending,
                                    nullHandling: NullHandling.Last,
                                },
                            ],
                        },
                        {
                            name: 'Without Consecutive',
                            condition: (get, id) => !hasConsec(get, id),
                            criteria: [
                                {
                                    getValue: bestLapValue,
                                    direction: SortDirection.Ascending,
                                    nullHandling: NullHandling.Last,
                                },
                            ],
                        },
                    ],
                },
                {
                    name: 'No Laps',
                    condition: (get, id) => !hasLaps(get, id),
                    criteria: [
                        {
                            getValue: nextRaceDistance,
                            direction: SortDirection.Ascending,
                            nullHandling: NullHandling.Last,
                        },
                        {
                            getValue: channelNumber,
                            direction: SortDirection.Ascending,
                            nullHandling: NullHandling.Last,
                        },
                    ],
                },
            ],
        },
        {
            name: 'Eliminated',
            condition: isEliminated,
            criteria: [
                {
                    getValue: eliminationStage,
                    direction: SortDirection.Descending,
                    nullHandling: NullHandling.Last,
                },
                {
                    getValue: eliminationPoints,
                    direction: SortDirection.Descending,
                    nullHandling: NullHandling.Last,
                },
            ],
        },
        {
            name: 'Fallback',
            criteria: [
                {
                    getValue: nextRaceDistance,
                    direction: SortDirection.Ascending,
                    nullHandling: NullHandling.Last,
                },
                {
                    getValue: channelNumber,
                    direction: SortDirection.Ascending,
                    nullHandling: NullHandling.Last,
                },
            ],
        },
    ];
}

// Backward-compatible named configs
export const defaultSortConfigCurrent: SortGroup[] = createDefaultSortConfig('current');
export const defaultSortConfigPrevious: SortGroup[] = createDefaultSortConfig('previous');
