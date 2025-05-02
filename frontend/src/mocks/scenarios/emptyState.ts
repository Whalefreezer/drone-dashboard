// Scenario returning empty arrays or default objects for list endpoints
import { http, HttpResponse } from 'msw';
import { BASE_URL, MOCK_EVENT_ID } from '../handlers.ts'; // Re-use constants
import type { RaceEvent } from '../../types/index.ts';
import { EventType } from '../../types/index.ts';

// Minimal valid event structure for Event.json when empty
const mockEmptyEvent: RaceEvent[] = [{
  ID: MOCK_EVENT_ID, Name: 'Empty Event', RaceLength: '03:00', EventType: EventType.Race, Start: '2024-01-01T09:00:00Z',
  End: '2024-01-01T18:00:00Z', Laps: 0, PBLaps: 0, MinStartDelay: '00:01', MaxStartDelay: '00:05',
  PrimaryTimingSystemLocation: '', RaceStartIgnoreDetections: '00:01', MinLapTime: '00:05',
  LastOpened: '2024-01-01T08:00:00Z', PilotChannels: [], RemovedPilots: [], Rounds: [],
  Club: 'Empty Club', Channels: [], ChannelColors: [],
  ChannelDisplayNames: [], Enabled: true, MultiGPRaceFormat: '', Races: [],
  SyncWithFPVTrackside: false, SyncWithMultiGP: false, GenerateHeatsMultiGP: false,
  VisibleOnline: false, Locked: false, Track: 'Empty Track', Sectors: [], PilotsRegistered: 0,
  ExternalID: 299,
}];

export const emptyStateHandlers = [
  // Mock GET /api - Still needs to return the basic HTML with event ID
  http.get(`${BASE_URL}/api`, () => {
    const htmlResponse = `<html><body><script>var eventManager = new EventManager("events/${MOCK_EVENT_ID}")</script></body></html>`;
    return new Response(htmlResponse, { headers: { 'Content-Type': 'text/html' } });
  }),

  // Mock GET /api/events/:eventId/Event.json - Return minimal event data
  http.get(`${BASE_URL}/api/events/:eventId/Event.json`, () => {
    return HttpResponse.json(mockEmptyEvent);
  }),

  // Mock GET /api/events/:eventId/Pilots.json - Return empty array
  http.get(`${BASE_URL}/api/events/:eventId/Pilots.json`, () => {
    return HttpResponse.json([]);
  }),

  // Mock GET /api/httpfiles/Channels.json - Return empty array
  http.get(`${BASE_URL}/api/httpfiles/Channels.json`, () => {
    return HttpResponse.json([]);
  }),

  // Mock GET /api/events/:eventId/Rounds.json - Return empty array
  http.get(`${BASE_URL}/api/events/:eventId/Rounds.json`, () => {
    return HttpResponse.json([]);
  }),

  // Mock GET /api/events/:eventId/:raceId/Race.json - Return empty array or 404? Let's return 404 as no races exist.
  http.get(`${BASE_URL}/api/events/:eventId/:raceId/Race.json`, () => {
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }),

  // Add other endpoints as needed, likely returning empty arrays or default objects
]; 