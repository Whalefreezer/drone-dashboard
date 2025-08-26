import { useAtomValue } from 'jotai';
import {
    channelsDataAtom,
    overallBestTimesAtom,
    pilotsAtom,
    raceFamilyAtom,
    RaceWithProcessedLaps,
    roundsDataAtom,
} from '../state/index.ts';
import { PilotChannel } from '../types/index.ts';
import { getLapClassName, getPositionWithSuffix } from '../common/index.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { Bracket, BracketPilot } from '../bracket/bracket-types.ts';
import './LapsView.css';

const POSITION_POINTS: Record<number, number> = {
    1: 10,
    2: 7,
    3: 4,
    4: 3,
};

interface LapsViewProps {
    raceId: string;
}

export function LapsView({ raceId }: LapsViewProps) {
    const roundData = useAtomValue(roundsDataAtom);
    const race = useAtomValue(raceFamilyAtom(raceId));
    const pilots = useAtomValue(pilotsAtom);

    const round = roundData.find((r) => r.ID === race.Round);

    const getBracketData = (): Bracket | null => {
        const normalizeString = (str: string) => str.toLowerCase().replace(/\s+/g, '');

        const racePilotNames = new Set(
            race.PilotChannels
                .map((pc) => pilots.find((p) => p.ID === pc.Pilot)?.Name ?? '')
                .filter((name) => name !== '')
                .map(normalizeString),
        );

        return null;
    };

    const matchingBracket = getBracketData();

    return (
        <div className='laps-view'>
            <div className='race-info'>
                <div className='race-number'>
                    {round?.RoundNumber}-{race.RaceNumber}
                    {matchingBracket && (
                        <span style={{ marginLeft: '8px', color: '#888' }}>
                            ({matchingBracket.name})
                        </span>
                    )}
                </div>
                <LapsTable race={race} matchingBracket={matchingBracket} />
            </div>
        </div>
    );
}

function LapsTable(
    { race, matchingBracket }: { race: RaceWithProcessedLaps; matchingBracket: Bracket | null },
) {
    const pilotsWithLaps = race.PilotChannels.map((pilotChannel) => {
        const completedLaps = race.processedLaps.filter((lap) =>
            lap.pilotId === pilotChannel.Pilot
        ).length;
        return { pilotChannel, completedLaps };
    }).sort((a, b) => b.completedLaps - a.completedLaps);

    const maxLaps = Math.max(0, ...race.processedLaps.map((lap) => lap.lapNumber));

    return (
        <table className='laps-table'>
            <LapsTableHeader maxLaps={maxLaps} matchingBracket={matchingBracket} />
            <tbody>
                {pilotsWithLaps.map((pilotData, index) => (
                    <LapsTableRow
                        key={pilotData.pilotChannel.ID}
                        pilotChannel={pilotData.pilotChannel}
                        position={index + 1}
                        maxLaps={maxLaps}
                        race={race}
                        matchingBracket={matchingBracket}
                    />
                ))}
            </tbody>
        </table>
    );
}

function LapsTableHeader(
    { maxLaps, matchingBracket }: { maxLaps: number; matchingBracket: Bracket | null },
) {
    const headerCells = [
        <th key='header-pos'>Pos</th>,
        <th key='header-name'>Name</th>,
        <th key='header-channel'>Chan</th>,
    ];

    if (matchingBracket) {
        headerCells.push(
            <th key='header-points'>Points</th>,
        );

        matchingBracket.pilots?.[0]?.rounds.forEach((_, index: number) => {
            headerCells.push(
                <th key={`header-bracket-round-${index}`}>R{index + 1}</th>,
            );
        });
    }

    for (let i = 0; i <= maxLaps; i++) {
        headerCells.push(
            <th key={`header-lap-${i}`}>
                {i === 0 ? 'HS' : `L${i}`}
            </th>,
        );
    }

    return (
        <thead>
            <tr>{headerCells}</tr>
        </thead>
    );
}

function LapsTableRow({ pilotChannel, position, maxLaps, race, matchingBracket }: {
    pilotChannel: PilotChannel;
    position: number;
    maxLaps: number;
    race: RaceWithProcessedLaps;
    matchingBracket: Bracket | null;
}) {
    const pilots = useAtomValue(pilotsAtom);
    const channels = useAtomValue(channelsDataAtom);
    const overallBestTimes = useAtomValue(overallBestTimesAtom);

    const pilot = pilots.find((p) => p.ID === pilotChannel.Pilot)!;
    const channel = channels.find((c) => c.ID === pilotChannel.Channel)!;

    const pilotLaps = race.processedLaps.filter((lap) => lap.pilotId === pilotChannel.Pilot);

    const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);

    const fastestLap = racingLaps.length > 0
        ? Math.min(...racingLaps.map((lap) => lap.lengthSeconds))
        : Infinity;

    const overallFastestLap = race.processedLaps.filter((lap) => !lap.isHoleshot).length > 0
        ? Math.min(
            ...race.processedLaps
                .filter((lap) => !lap.isHoleshot)
                .map((lap) => lap.lengthSeconds),
        )
        : Infinity;

    const bracketPilot = matchingBracket?.pilots.find(
        (p: BracketPilot) =>
            p.name.toLowerCase().replace(/\s+/g, '') ===
                pilot.Name.toLowerCase().replace(/\s+/g, ''),
    );

    const cells = [
        <td key='pos'>
            {maxLaps > 0
                ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {getPositionWithSuffix(position)}
                        {POSITION_POINTS[position] && (
                            <span style={{ fontSize: '0.8em', color: '#888' }}>
                                +{POSITION_POINTS[position]}
                            </span>
                        )}
                    </div>
                )
                : '-'}
        </td>,
        <td key='name'>{pilot.Name}</td>,
        <td key='channel'>
            <div className='flex-row'>
                {channel.ShortBand}
                {channel.Number}
                <ChannelSquare channelID={pilotChannel.Channel} />
            </div>
        </td>,
    ];

    if (matchingBracket && bracketPilot) {
        cells.push(
            <td key='points' style={{ color: '#00ff00' }}>{bracketPilot.points}</td>,
        );

        bracketPilot.rounds.forEach((round: number | null, index: number) => {
            cells.push(
                <td key={`bracket-round-${index}`}>
                    {round
                        ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {round}
                                {POSITION_POINTS[round] && (
                                    <span style={{ fontSize: '0.8em', color: '#888' }}>
                                        +{POSITION_POINTS[round]}
                                    </span>
                                )}
                            </div>
                        )
                        : '-'}
                </td>,
            );
        });
    }

    const lapCells = Array.from({ length: maxLaps + 1 }, (_, i) => {
        const lapData = pilotLaps.find((lap) =>
            (lap.isHoleshot && i === 0) || (!lap.isHoleshot && lap.lapNumber === i)
        );
        if (lapData) {
            const className = getLapClassName(
                lapData,
                overallBestTimes.overallFastestLap,
                overallBestTimes.pilotBestLaps.get(pilotChannel.Pilot),
                overallFastestLap,
                fastestLap,
            );
            return (
                <td key={`${lapData.isHoleshot ? 'hs' : 'lap'}-${i}`} className={className}>
                    {lapData.lengthSeconds.toFixed(3)}
                </td>
            );
        } else {
            return <td key={`empty-lap-${i}`}>-</td>;
        }
    });

    cells.push(...lapCells);

    return <tr>{cells}</tr>;
}
