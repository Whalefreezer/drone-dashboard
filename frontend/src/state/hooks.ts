import { Atom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { AtomWithSuspenseQueryResult } from 'jotai-tanstack-query';
import { currentRaceIdSignalAtom, racesAtom } from './atoms.ts';
import { findIndexOfCurrentRace } from '../common/utils.ts';

// Custom hook to simplify accessing data from atoms created with atomWithSuspenseQuery
export function useQueryAtom<T>(queryAtom: Atom<AtomWithSuspenseQueryResult<T, Error>>): T {
    const { data } = useAtomValue(queryAtom);
    return data;
}

// Syncs the derived current race ID into a synchronous signal atom for query tuning.
export function useSyncCurrentRaceId() {
    const races = useAtomValue(racesAtom);
    const setCurrentRaceId = useSetAtom(currentRaceIdSignalAtom);
    useEffect(() => {
        const idx = findIndexOfCurrentRace(races);
        const id = idx !== -1 ? races[idx].ID : null;
        setCurrentRaceId(id);
    }, [races, setCurrentRaceId]);
}

// Renderless component to isolate Suspense when syncing current race id.
export function SyncCurrentRaceIdNode() {
    useSyncCurrentRaceId();
    return null;
}
