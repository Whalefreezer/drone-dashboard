import "../tests/global-jsdom.ts"; // Initialize JSDOM environment FIRST
import "../tests/test_setup.ts"; // Import common setup (MSW, cleanup)
import { render, screen } from "@testing-library/react";
import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { http, HttpResponse } from 'msw'; // Import msw utils for overrides
import { Provider } from 'jotai'; // Import Provider for atoms

import { PilotChannelView } from './PilotChannelView.tsx';
import { server } from '../mocks/server.ts';
import { BASE_URL, MOCK_EVENT_ID } from '../mocks/handlers.ts'; // Assuming MOCK_EVENT_ID is exported
import { ChannelPrefix, ShortBand, EventType, RoundType } from '../types/index.ts';
import type { RaceEvent, Pilot, Channel, PilotChannel } from '../types/index.ts';

// Mock data specifically for these tests, potentially overriding global mocks if needed
const mockTestPilot = { ID: 'pilot-test-1', Name: 'Tester', Phonetic: 'Tango', TimingSensitivityPercent: 100, PracticePilot: false, ExternalID: 901, Aircraft: null, BestResult: null, CatchPhrase: null, DiscordID: null, FirstName: null, LastName: null, PhotoPath: null, SillyName: null } as Pilot;
const mockTestChannel: Channel = { ID: 'chan-test-1', Number: 5, Band: 'R', ChannelPrefix: ChannelPrefix.R, Frequency: 5865, DisplayName: null, ExternalID: 902, ShortBand: ShortBand.R };
const mockTestPilotChannel: PilotChannel = { ID: 'pc-test-1', Pilot: mockTestPilot.ID, Channel: mockTestChannel.ID, ExternalID: 903 };
const mockTestEventData: RaceEvent = {
    ID: MOCK_EVENT_ID, Name: 'Test Event for Pilot View', RaceLength: '03:00', EventType: EventType.Race, Start: '2024-01-01T09:00:00Z',
    End: '2024-01-01T18:00:00Z', Laps: 3, PBLaps: 3, MinStartDelay: '00:01', MaxStartDelay: '00:05',
    PrimaryTimingSystemLocation: '', RaceStartIgnoreDetections: '00:01', MinLapTime: '00:05',
    LastOpened: '2024-01-01T08:00:00Z', PilotChannels: [mockTestPilotChannel], RemovedPilots: [], Rounds: [],
    Club: 'Test Club', Channels: [mockTestChannel.ID, 'chan-other'], ChannelColors: ['#00FF00', '#FF00FF'], // Green for test channel
    ChannelDisplayNames: [null, null], // Changed from strings to nulls based on type `null[]`
    Enabled: true, MultiGPRaceFormat: '', Races: [],
    SyncWithFPVTrackside: false, SyncWithMultiGP: false, GenerateHeatsMultiGP: false,
    VisibleOnline: false, Locked: false, Track: 'Test Track', Sectors: [], PilotsRegistered: 1,
    ExternalID: 904,
};

describe('PilotChannelView', () => {
    it('renders pilot name, channel band, and number correctly', async () => {
        // Override MSW handlers for this specific test if needed, otherwise rely on global mocks + Provider initial values
        server.use(
            http.get(`${BASE_URL}/api/events/${MOCK_EVENT_ID}/Pilots.json`, () => {
                return HttpResponse.json([mockTestPilot]);
            }),
            http.get(`${BASE_URL}/api/httpfiles/Channels.json`, () => {
                return HttpResponse.json([mockTestChannel]);
            }),
            http.get(`${BASE_URL}/api/events/${MOCK_EVENT_ID}/Event.json`, () => {
                return HttpResponse.json([mockTestEventData]);
            })
        );

        render(
            <Provider>
                <PilotChannelView pilotChannel={mockTestPilotChannel} />
            </Provider>
        );

        // Wait for data to load and component to render
        const pilotInfoElement = await screen.findByText(/Tester R5/i); // Pilot Name + Channel Band + Channel Number
        assertEquals(pilotInfoElement !== null, true, "Should display pilot name, channel band, and number");
    });

    it('renders the correct color indicator based on event data', async () => {
         server.use(
            http.get(`${BASE_URL}/api/events/${MOCK_EVENT_ID}/Pilots.json`, () => {
                return HttpResponse.json([mockTestPilot]);
            }),
            http.get(`${BASE_URL}/api/httpfiles/Channels.json`, () => {
                return HttpResponse.json([mockTestChannel]);
            }),
            http.get(`${BASE_URL}/api/events/${MOCK_EVENT_ID}/Event.json`, () => {
                return HttpResponse.json([mockTestEventData]); // Uses the mock with green color for chan-test-1
            })
        );

        const { container } = render(
            <Provider>
                <PilotChannelView pilotChannel={mockTestPilotChannel} />
            </Provider>
        );

        // Wait for rendering
        await screen.findByText(/Tester R5/i);

        const colorIndicator = container.querySelector('.color-indicator') as HTMLElement;
        assertEquals(colorIndicator !== null, true, "Color indicator should exist");
        assertEquals(colorIndicator.style.backgroundColor, 'rgb(0, 255, 0)', "Color should be green based on mock data"); // #00FF00 -> rgb(0, 255, 0)
    });

     it('renders the default color indicator when channel color is not found', async () => {
        // Modify event data mock to exclude the channel or its color
        const eventDataNoColor = {
            ...mockTestEventData,
            Channels: ['chan-other'], // Remove test channel ID
            ChannelColors: ['#FF00FF'],
            ChannelDisplayNames: [null] // Adjust to match Channels array length
        };

         server.use(
            http.get(`${BASE_URL}/api/events/${MOCK_EVENT_ID}/Pilots.json`, () => {
                return HttpResponse.json([mockTestPilot]);
            }),
            http.get(`${BASE_URL}/api/httpfiles/Channels.json`, () => {
                return HttpResponse.json([mockTestChannel]); // Still provide the channel itself
            }),
            http.get(`${BASE_URL}/api/events/${MOCK_EVENT_ID}/Event.json`, () => {
                return HttpResponse.json([eventDataNoColor]); // Use the modified event data
            })
        );

        const { container } = render(
            <Provider>
                <PilotChannelView pilotChannel={mockTestPilotChannel} />
            </Provider>
        );

         // Wait for rendering
        await screen.findByText(/Tester R5/i);

        const colorIndicator = container.querySelector('.color-indicator') as HTMLElement;
        assertEquals(colorIndicator !== null, true, "Color indicator should exist");
        assertEquals(colorIndicator.style.backgroundColor, 'rgb(136, 136, 136)', "Color should be the default grey #888"); // #888 -> rgb(136, 136, 136)
    });
}); 