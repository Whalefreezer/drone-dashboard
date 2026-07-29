import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { isNonCompetitiveRound, selectStandingsRaces } from './standings-races.ts';
import { EventType, type PBRaceRecord, type PBRoundRecord } from '../api/pbTypes.ts';

function round(id: string, eventType?: EventType): PBRoundRecord {
	return { id, eventType, roundNumber: 1, valid: true };
}

function race(id: string, roundId: string, raceOrder: number): PBRaceRecord {
	return { id, round: roundId, raceOrder } as PBRaceRecord;
}

const ids = (races: PBRaceRecord[]) => races.map((r) => r.id);

describe('isNonCompetitiveRound', () => {
	it('flags Practice and CasualPractice rounds', () => {
		assertEquals(isNonCompetitiveRound(round('r1', EventType.Practice)), true);
		assertEquals(isNonCompetitiveRound(round('r2', EventType.CasualPractice)), true);
	});

	it('keeps rounds that count toward standings', () => {
		assertEquals(isNonCompetitiveRound(round('r1', EventType.Race)), false);
		assertEquals(isNonCompetitiveRound(round('r2', EventType.TimeTrial)), false);
		assertEquals(isNonCompetitiveRound(round('r3', EventType.Freestyle)), false);
		assertEquals(isNonCompetitiveRound(round('r4', EventType.Unknown)), false);
	});

	it('treats a round with no eventType as competitive', () => {
		assertEquals(isNonCompetitiveRound(round('r1', undefined)), false);
	});
});

describe('selectStandingsRaces', () => {
	it('drops races from practice rounds and keeps the rest', () => {
		const rounds = [
			round('practice', EventType.Practice),
			round('tt', EventType.TimeTrial),
			round('race', EventType.Race),
		];
		const races = [
			race('p1', 'practice', 1),
			race('p2', 'practice', 2),
			race('t1', 'tt', 3),
			race('m1', 'race', 4),
		];

		assertEquals(ids(selectStandingsRaces(races, rounds)), ['t1', 'm1']);
	});

	it('drops CasualPractice races too', () => {
		const rounds = [round('casual', EventType.CasualPractice), round('tt', EventType.TimeTrial)];
		const races = [race('c1', 'casual', 1), race('t1', 'tt', 2)];

		assertEquals(ids(selectStandingsRaces(races, rounds)), ['t1']);
	});

	it('preserves race order of the surviving races', () => {
		const rounds = [round('practice', EventType.Practice), round('tt', EventType.TimeTrial)];
		const races = [race('t1', 'tt', 1), race('p1', 'practice', 2), race('t2', 'tt', 3)];

		assertEquals(ids(selectStandingsRaces(races, rounds)), ['t1', 't2']);
	});

	it('returns every race when the event has no practice rounds', () => {
		const rounds = [round('tt', EventType.TimeTrial), round('race', EventType.Race)];
		const races = [race('t1', 'tt', 1), race('m1', 'race', 2)];

		assertEquals(ids(selectStandingsRaces(races, rounds)), ['t1', 'm1']);
	});

	it('keeps races whose round has not been ingested yet', () => {
		const rounds = [round('practice', EventType.Practice)];
		const races = [race('p1', 'practice', 1), race('orphan', 'not-ingested-yet', 2)];

		assertEquals(ids(selectStandingsRaces(races, rounds)), ['orphan']);
	});

	it('keeps a race with no round rather than discarding it', () => {
		const rounds = [round('practice', EventType.Practice)];
		const races = [race('p1', 'practice', 1), { id: 'no-round', raceOrder: 2 } as PBRaceRecord];

		assertEquals(ids(selectStandingsRaces(races, rounds)), ['no-round']);
	});

	it('returns an empty list when the day is still all practice', () => {
		const rounds = [round('practice', EventType.Practice)];
		const races = [race('p1', 'practice', 1), race('p2', 'practice', 2)];

		assertEquals(ids(selectStandingsRaces(races, rounds)), []);
	});
});
