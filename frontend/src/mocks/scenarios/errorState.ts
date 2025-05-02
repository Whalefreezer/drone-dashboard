// Scenario returning 500 errors for all API endpoints
import { http, HttpResponse } from 'msw';
import { BASE_URL, MOCK_EVENT_ID } from '../handlers.ts'; // Re-use constants

// Use HttpResponse.error() static method for 500 responses
const serverErrorResponse = () => HttpResponse.error();

export const errorStateHandlers = [
  // Mock GET /api - Let this succeed so the app can potentially get the event ID
  http.get(`${BASE_URL}/api`, () => {
    const htmlResponse = `<html><body><script>var eventManager = new EventManager("events/${MOCK_EVENT_ID}")</script></body></html>`;
    return new Response(htmlResponse, { headers: { 'Content-Type': 'text/html' } });
  }),

  // All other relevant API endpoints return 500
  http.get(`${BASE_URL}/api/events/:eventId/Event.json`, serverErrorResponse),
  http.get(`${BASE_URL}/api/events/:eventId/Pilots.json`, serverErrorResponse),
  http.get(`${BASE_URL}/api/httpfiles/Channels.json`, serverErrorResponse),
  http.get(`${BASE_URL}/api/events/:eventId/Rounds.json`, serverErrorResponse),
  http.get(`${BASE_URL}/api/events/:eventId/:raceId/Race.json`, serverErrorResponse),
  // Add other endpoints as needed
]; 