import { http, HttpResponse, PathParams } from 'msw';
import type { Race, RaceEvent, Pilot, Channel, Round } from '../types/index.ts';
// Import enums needed for mocks
import { ChannelPrefix, ShortBand, EventType, RoundType } from '../types/index.ts';

// ==================
// Mock Data Definitions
// ==================

// Use a consistent mock event ID
export const MOCK_EVENT_ID = 'mock-event-123';
// Define base URL for mocks and export it
export const BASE_URL = 'http://localhost';

const mockApiPilots: Pilot[] = [
  { ID: 'pilot1', Name: 'Alice', Phonetic: 'Alpha', TimingSensitivityPercent: 100, PracticePilot: false, ExternalID: 301, Aircraft: null, BestResult: null, CatchPhrase: null, DiscordID: null, FirstName: null, LastName: null, PhotoPath: null, SillyName: null },
  { ID: 'pilot2', Name: 'Bob', Phonetic: 'Bravo', TimingSensitivityPercent: 100, PracticePilot: false, ExternalID: 302, Aircraft: null, BestResult: null, CatchPhrase: null, DiscordID: null, FirstName: null, LastName: null, PhotoPath: null, SillyName: null },
];

const mockApiChannels: Channel[] = [
  // Use enum members for enum types
  { ID: 'chan1', Number: 1, Band: 'F', ChannelPrefix: ChannelPrefix.F, Frequency: 5740, DisplayName: null, ExternalID: 401, ShortBand: ShortBand.F },
  { ID: 'chan2', Number: 2, Band: 'R', ChannelPrefix: ChannelPrefix.R, Frequency: 5800, DisplayName: null, ExternalID: 402, ShortBand: ShortBand.R },
];

const mockApiRounds: Round[] = [
  // Use enum members for enum types
  { ID: 'round1', Name: 'Practice', RoundNumber: 1, EventType: EventType.Race, RoundType: RoundType.Round, Valid: true, PointSummary: null, TimeSummary: null, LapCountAfterRound: false, Order: 1, SheetFormatFilename: null, ExternalID: 501 },
];

const mockApiRaces: Race[] = [
  {
    ID: 'race1', RaceNumber: 1, Start: '2024-01-01T10:00:00Z', End: '2024-01-01T10:03:00Z',
    PilotChannels: [{ Pilot: 'pilot1', Channel: 'chan1', ID: 'pc1', ExternalID: 1 }],
    Laps: [], Round: 'round1', Detections: [], TotalPausedTime: '00:00', TargetLaps: 3,
    PrimaryTimingSystemLocation: '', Valid: true, AutoAssignNumbers: false, Event: MOCK_EVENT_ID,
    Bracket: '', ExternalID: 101,
  },
  {
    ID: 'race2', RaceNumber: 2, Start: '', End: '',
    PilotChannels: [{ Pilot: 'pilot2', Channel: 'chan2', ID: 'pc2', ExternalID: 2 }],
    Laps: [], Round: 'round1', Detections: [], TotalPausedTime: '00:00', TargetLaps: 3,
    PrimaryTimingSystemLocation: '', Valid: true, AutoAssignNumbers: false, Event: MOCK_EVENT_ID,
    Bracket: '', ExternalID: 102,
  }
];

const mockApiEvent: RaceEvent[] = [{
  ID: MOCK_EVENT_ID, Name: 'Test Event', RaceLength: '03:00', EventType: EventType.Race, Start: '2024-01-01T09:00:00Z',
  End: '2024-01-01T18:00:00Z', Laps: 3, PBLaps: 3, MinStartDelay: '00:01', MaxStartDelay: '00:05',
  PrimaryTimingSystemLocation: '', RaceStartIgnoreDetections: '00:01', MinLapTime: '00:05',
  LastOpened: '2024-01-01T08:00:00Z', PilotChannels: [], RemovedPilots: [], Rounds: ['round1'],
  Club: 'Test Club', Channels: ['chan1', 'chan2'], ChannelColors: ['#FF0000', '#0000FF'],
  ChannelDisplayNames: [], Enabled: true, MultiGPRaceFormat: '', Races: ['race1', 'race2'],
  SyncWithFPVTrackside: false, SyncWithMultiGP: false, GenerateHeatsMultiGP: false,
  VisibleOnline: false, Locked: false, Track: 'Test Track', Sectors: [], PilotsRegistered: 2,
  ExternalID: 201,
}];

// Helper to find specific race mock data
const findMockRace = (raceId: string | readonly string[]) => {
  const id = Array.isArray(raceId) ? raceId[0] : raceId;
  return mockApiRaces.find(race => race.ID === id);
}

// ==================
// MSW Handlers
// ==================

export const handlers = [
  // Mock GET /api - Used by eventIdAtom
  http.get(`${BASE_URL}/api`, () => {
    const htmlResponse = `<html><body><script>var eventManager = new EventManager("events/${MOCK_EVENT_ID}")</script></body></html>`;
    // Use standard Response for HTML
    return new Response(htmlResponse, { headers: { 'Content-Type': 'text/html' } });
  }),

  // Mock GET /api/events/:eventId/Event.json - Used by eventDataAtom
  http.get<{ eventId: string }>(`${BASE_URL}/api/events/:eventId/Event.json`, ({ params }) => {
    return HttpResponse.json(mockApiEvent);
  }),

  // Mock GET /api/events/:eventId/Pilots.json - Used by pilotsAtom
  http.get<{ eventId: string }>(`${BASE_URL}/api/events/:eventId/Pilots.json`, ({ params }) => {
    return HttpResponse.json(mockApiPilots);
  }),

  // Mock GET /api/httpfiles/Channels.json - Used by channelsDataAtom
  http.get(`${BASE_URL}/api/httpfiles/Channels.json`, () => {
    return HttpResponse.json(mockApiChannels);
  }),

  // Mock GET /api/events/:eventId/Rounds.json - Used by roundsDataAtom
  http.get<{ eventId: string }>(`${BASE_URL}/api/events/:eventId/Rounds.json`, ({ params }) => {
    return HttpResponse.json(mockApiRounds);
  }),

  // Mock GET /api/events/:eventId/:raceId/Race.json - Used by raceFamilyAtom
  http.get<{ eventId: string, raceId: string }>(`${BASE_URL}/api/events/:eventId/:raceId/Race.json`, ({ params }) => {
    const raceData = findMockRace(params.raceId);
    if (raceData) {
      return HttpResponse.json([raceData]);
    } else {
      // Use standard Response for 404
      return new Response(null, { status: 404, statusText: 'Not Found' });
    }
  }),

  // TODO: Add handler for /brackets/groups/0 if needed for bracketsDataAtom
]; 