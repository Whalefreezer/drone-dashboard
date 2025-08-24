import type { DbObject, Guid } from "./common.ts";

export enum ResultType {
  Race = "Race",
  RoundRollOver = "RoundRollOver"
}

/**
 * GET /events/{eventId}/Results.json (all/general)
 * GET /events/{eventId}/{raceId}/Result.json (per-race)
 */
export interface ResultJson extends DbObject {
  Points: number;
  Position: number;
  Valid: boolean;
  Event: Guid;
  Pilot: Guid;
  Race?: Guid;
  Round: Guid;
  DNF: boolean;
  ResultType: ResultType;
}

export type ResultsFile = ResultJson[];
