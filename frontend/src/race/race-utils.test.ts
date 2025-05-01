/// <reference lib="deno.ns" />
import { assert, assertEquals } from '@std/assert';
import { defaultLeaderboardSortConfig, sortLeaderboard } from './race-utils.ts';
import type { LeaderboardEntry } from '../state/atoms.ts';
import type { Channel, Pilot } from '../types/types.ts';
import { ChannelPrefix, ShortBand } from '../types/types.ts'; // Import necessary enums

// --- Mock Data ---

const mockPilot = (id: string, name: string): Pilot => ({
    ID: id,
    Name: name,
    // --- Properties from types.ts (mostly optional/nullable for mocks) ---
    Phonetic: name, // Use name as placeholder
    FirstName: null,
    LastName: null,
    SillyName: null,
    DiscordID: null,
    Aircraft: null,
    CatchPhrase: null,
    BestResult: null,
    TimingSensitivityPercent: 100,
    PracticePilot: false,
    PhotoPath: null,
    ExternalID: parseInt(id.replace(/\D/g, '')) || 0, // Derive a number
    // Seed: null, // REMOVED - Not in Pilot type
});

const mockChannel = (id: string, number: number): Channel => ({
    ID: id,
    Number: number,
    // Name: `Channel ${number}`, // REMOVED - Not in Channel type
    // --- Properties from types.ts ---
    Band: ShortBand.R, // Use an enum value for the required string
    ChannelPrefix: ChannelPrefix.R, // Use an enum value
    Frequency: 5658 + number * 20, // Assign a plausible frequency
    DisplayName: null,
    ExternalID: parseInt(id.replace(/\D/g, '')) || 0, // Derive a number
    ShortBand: ShortBand.R, // Added required ShortBand
});

// Helper to create a minimal LeaderboardEntry
const createEntry = (
    id: string,
    name: string,
    overrides: Partial<LeaderboardEntry> = {},
): LeaderboardEntry => ({
    pilot: mockPilot(id, name),
    bestLap: null,
    consecutiveLaps: null,
    bestHoleshot: null,
    channel: null,
    racesUntilNext: -1, // Default: not scheduled or already raced
    totalLaps: 0,
    eliminatedInfo: null,
    ...overrides,
});

// Specific Test Entries
const pilotA_Consecutive = createEntry('p1', 'Alice', {
    totalLaps: 5,
    consecutiveLaps: { time: 10.5, roundId: 'r1', raceNumber: 1 },
    bestLap: { time: 3.1, roundId: 'r1', raceNumber: 1 },
    channel: mockChannel('c1', 1),
});

const pilotB_BestLapOnly = createEntry('p2', 'Bob', {
    totalLaps: 3,
    bestLap: { time: 3.0, roundId: 'r2', raceNumber: 2 },
    channel: mockChannel('c2', 2),
});

const pilotC_NoLaps_Waiting = createEntry('p3', 'Charlie', {
    racesUntilNext: 2,
    channel: mockChannel('c3', 3),
});

const pilotD_NoLaps_NotWaiting = createEntry('p4', 'David', {
    racesUntilNext: -1,
    channel: mockChannel('c4', 4),
});

const pilotE_Eliminated_HighPoints = createEntry('p5', 'Eve', {
    eliminatedInfo: { bracket: 'H10', position: 3, points: 15 }, // Stage 2
    channel: mockChannel('c5', 5),
});

const pilotF_Eliminated_LowPoints = createEntry('p6', 'Frank', {
    eliminatedInfo: { bracket: 'H9', position: 4, points: 10 }, // Stage 2
    channel: mockChannel('c6', 6),
});

const pilotG_Eliminated_EarlierStage = createEntry('p7', 'Grace', {
    eliminatedInfo: { bracket: 'H1', position: 5, points: 20 }, // Stage 1
    channel: mockChannel('c7', 7),
});

// --- Test Suite ---

Deno.test('Sort Leaderboard - Basic Group Order (Active > Eliminated)', () => {
    const entries = [pilotE_Eliminated_HighPoints, pilotA_Consecutive];
    const sorted = sortLeaderboard(entries, defaultLeaderboardSortConfig);
    const sortedNames = sorted.map((e) => e.pilot.Name);
    assertEquals(sortedNames, ['Alice', 'Eve']); // Active pilot first
});

Deno.test('Sort Leaderboard - Active Pilots Subgroup Order (Laps > No Laps)', () => {
    const entries = [pilotC_NoLaps_Waiting, pilotA_Consecutive];
    const sorted = sortLeaderboard(entries, defaultLeaderboardSortConfig);
    const sortedNames = sorted.map((e) => e.pilot.Name);
    assertEquals(sortedNames, ['Alice', 'Charlie']); // Pilot with laps first
});

Deno.test('Sort Leaderboard - Pilots With Laps Subgroup Order (Consecutive > Best Lap Only)', () => {
    const entries = [pilotB_BestLapOnly, pilotA_Consecutive];
    const sorted = sortLeaderboard(entries, defaultLeaderboardSortConfig);
    const sortedNames = sorted.map((e) => e.pilot.Name);
    assertEquals(sortedNames, ['Alice', 'Bob']); // Pilot with consecutive laps first
});

Deno.test('Sort Leaderboard - Pilots With Laps Tiebreaker (Consecutive Time)', () => {
    const pilotA_FasterConsecutive = createEntry('p1', 'Alice', {
        totalLaps: 5,
        consecutiveLaps: { time: 10.5, roundId: 'r1', raceNumber: 1 },
    });
    const pilotH_SlowerConsecutive = createEntry('p8', 'Heidi', {
        totalLaps: 6,
        consecutiveLaps: { time: 11.0, roundId: 'r3', raceNumber: 3 },
    });
    const entries = [pilotH_SlowerConsecutive, pilotA_FasterConsecutive];
    const sorted = sortLeaderboard(entries, defaultLeaderboardSortConfig);
    const sortedNames = sorted.map((e) => e.pilot.Name);
    assertEquals(sortedNames, ['Alice', 'Heidi']); // Faster consecutive time first
});

Deno.test('Sort Leaderboard - Pilots Without Consecutive Laps Tiebreaker (Best Lap Time)', () => {
    const pilotB_FasterBestLap = createEntry('p2', 'Bob', {
        totalLaps: 3,
        bestLap: { time: 3.0, roundId: 'r2', raceNumber: 2 },
    });
    const pilotI_SlowerBestLap = createEntry('p9', 'Ivy', {
        totalLaps: 4,
        bestLap: { time: 3.2, roundId: 'r4', raceNumber: 4 },
    });
    const entries = [pilotI_SlowerBestLap, pilotB_FasterBestLap];
    const sorted = sortLeaderboard(entries, defaultLeaderboardSortConfig);
    const sortedNames = sorted.map((e) => e.pilot.Name);
    assertEquals(sortedNames, ['Bob', 'Ivy']); // Faster best lap time first
});

Deno.test('Sort Leaderboard - Pilots Without Laps Tiebreaker (Races Until Next > Channel)', () => {
    const pilotC_WaitingSooner = createEntry('p3', 'Charlie', {
        racesUntilNext: 2,
        channel: mockChannel('c3', 3),
    });
    const pilotJ_WaitingLater = createEntry('p10', 'Judy', {
        racesUntilNext: 5,
        channel: mockChannel('c10', 10),
    });
    const pilotK_NotWaiting_LowChan = createEntry('p11', 'Kevin', {
        racesUntilNext: -1,
        channel: mockChannel('c11', 1),
    });
    const pilotL_NotWaiting_HighChan = createEntry('p12', 'Liam', {
        racesUntilNext: -1,
        channel: mockChannel('c12', 12),
    });

    const entries = [
        pilotL_NotWaiting_HighChan,
        pilotJ_WaitingLater,
        pilotC_WaitingSooner,
        pilotK_NotWaiting_LowChan,
    ];
    const sorted = sortLeaderboard(entries, defaultLeaderboardSortConfig);
    const sortedNames = sorted.map((e) => e.pilot.Name);
    // Waiting pilots first, sorted by racesUntilNext. Then non-waiting sorted by channel.
    assertEquals(sortedNames, ['Charlie', 'Judy', 'Kevin', 'Liam']);
});

Deno.test('Sort Leaderboard - Eliminated Pilots Order (Stage > Points)', () => {
    const entries = [
        pilotG_Eliminated_EarlierStage,
        pilotF_Eliminated_LowPoints,
        pilotE_Eliminated_HighPoints,
    ];
    const sorted = sortLeaderboard(entries, defaultLeaderboardSortConfig);
    const sortedNames = sorted.map((e) => e.pilot.Name);
    // Sorted by stage descending (Finals > Semis > Quarters > Heats), then points descending
    assertEquals(sortedNames, ['Eve', 'Frank', 'Grace']); // Stage 2 (H10/H9) before Stage 1 (H1), then higher points first within Stage 2
});

Deno.test('Sort Leaderboard - Default Sort (Catch-all)', () => {
    // Create two pilots that don't fit other categories easily
    const pilotM = createEntry('p13', 'Mallory', {
        racesUntilNext: 1,
        channel: mockChannel('c13', 5),
    }); // No laps, waiting
    const pilotN = createEntry('p14', 'Nate', {
        racesUntilNext: -1,
        channel: mockChannel('c14', 2),
    }); // No laps, not waiting

    // The 'Active Pilots' -> 'Pilots without Laps' group should catch these
    const entries = [pilotN, pilotM];
    const sorted = sortLeaderboard(entries, defaultLeaderboardSortConfig);
    const sortedNames = sorted.map((e) => e.pilot.Name);
    assertEquals(sortedNames, ['Mallory', 'Nate']); // Sorted by racesUntilNext, then channel
});
