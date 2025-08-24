import type { DbObject, Guid, Lap, Detection, GamePoint, PrimaryTimingSystemLocation, JsonDate, TimeSpan } from "./common.ts";

/** GET /events/{eventId}/{raceId}/Race.json */
export interface Race extends DbObject {
  Laps: Lap[];
  Detections: Detection[];
  GamePoints: GamePoint[];

  Start: JsonDate;
  End: JsonDate;
  TotalPausedTime: TimeSpan;

  PilotChannels: { ID: Guid; Pilot: Guid; Channel: Guid }[];

  RaceNumber: number;
  Round: Guid;
  TargetLaps: number;
  PrimaryTimingSystemLocation: PrimaryTimingSystemLocation; // see enum in Event
  Valid: boolean;
  AutoAssignNumbers?: boolean;
  Event: Guid;
  Bracket?: string; // e.g., "A", "B", or "Winners"/"Losers"
}

export type RaceFile = Race[];
