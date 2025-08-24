// Path templates for the browser API

export const HTTPFILES_ROOT = '/httpfiles';
export const EVENTS_ROOT = '/events'; // /events/{eventId}

export const CHANNELS_JSON = `${HTTPFILES_ROOT}/Channels.json`;

export const EVENT_JSON = (eventId: string) => `${EVENTS_ROOT}/${eventId}/Event.json`;
export const PILOTS_JSON = (eventId: string) => `${EVENTS_ROOT}/${eventId}/Pilots.json`;
export const ROUNDS_JSON = (eventId: string) => `${EVENTS_ROOT}/${eventId}/Rounds.json`;
export const RESULTS_JSON = (eventId: string) => `${EVENTS_ROOT}/${eventId}/Results.json`;

export const RACE_JSON = (eventId: string, raceId: string) =>
    `${EVENTS_ROOT}/${eventId}/${raceId}/Race.json`;
export const RESULT_JSON = (eventId: string, raceId: string) =>
    `${EVENTS_ROOT}/${eventId}/${raceId}/Result.json`;
