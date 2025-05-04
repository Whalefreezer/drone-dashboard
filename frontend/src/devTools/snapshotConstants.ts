// No base URL needed if fetching relative paths from the same origin
// export const LIVE_API_BASE_URL = 'http://localhost:8080'; // Example

// API endpoint template paths to capture for snapshots
export const SNAPSHOT_TARGET_ENDPOINTS = [
  '/api/events/:eventId/Event.json',
  '/api/events/:eventId/Pilots.json',
  '/api/events/:eventId/Rounds.json',
  '/api/httpfiles/Channels.json',
  '/api/events/:eventId/:raceId/Race.json', // Special handling needed
  // '/brackets/groups/0', // Uncomment if brackets are used
];

// Specific template for race data that needs iterating
export const RACE_DATA_ENDPOINT_TEMPLATE = '/api/events/:eventId/:raceId/Race.json'; 

export const BASE_URL = 'http://localhost:5173';
