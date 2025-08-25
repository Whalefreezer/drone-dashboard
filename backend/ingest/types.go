package ingest

// Minimal Go structs aligned with frontend types for ingestion parsing.

// Guid is a 36-char GUID string
// (we keep it as string to match FPVTrackside payloads directly)
type Guid = string

// EventFile is an array with a single RaceEvent
// GET /events/{eventId}/Event.json
// Note: fields subset as needed for ingestion
// Field names match JSON exactly

type RaceEvent struct {
	ID                          Guid     `json:"ID"`
	Name                        string   `json:"Name"`
	EventType                   string   `json:"EventType"`
	Start                       string   `json:"Start"`
	End                         string   `json:"End"`
	Laps                        int      `json:"Laps"`
	PBLaps                      int      `json:"PBLaps"`
	PackLimit                   int      `json:"PackLimit"`
	RaceLength                  string   `json:"RaceLength"`
	MinStartDelay               string   `json:"MinStartDelay"`
	MaxStartDelay               string   `json:"MaxStartDelay"`
	PrimaryTimingSystemLocation string   `json:"PrimaryTimingSystemLocation"`
	RaceStartIgnoreDetections   string   `json:"RaceStartIgnoreDetections"`
	MinLapTime                  string   `json:"MinLapTime"`
	LastOpened                  string   `json:"LastOpened"`
	Rounds                      []Guid   `json:"Rounds"`
	Races                       []Guid   `json:"Races"`
	Channels                    []Guid   `json:"Channels"`
	ChannelColors               []string `json:"ChannelColors"`
	ChannelDisplayNames         []string `json:"ChannelDisplayNames"`
	Flags                       []string `json:"Flags"`
}

type EventFile = []RaceEvent

// Pilots
// GET /events/{eventId}/Pilots.json

type Pilot struct {
	ID            Guid   `json:"ID"`
	Name          string `json:"Name"`
	FirstName     string `json:"FirstName"`
	LastName      string `json:"LastName"`
	DiscordID     string `json:"DiscordID"`
	PracticePilot bool   `json:"PracticePilot"`
	PhotoPath     string `json:"PhotoPath"`
}

type PilotsFile = []Pilot

// Channels
// GET /httpfiles/Channels.json

type Channel struct {
	ID            Guid   `json:"ID"`
	Number        int    `json:"Number"`
	Band          string `json:"Band"`
	ShortBand     string `json:"ShortBand"`
	ChannelPrefix string `json:"ChannelPrefix"`
	Frequency     int    `json:"Frequency"`
	DisplayName   string `json:"DisplayName"`
}

type ChannelsFile = []Channel

// Rounds
// GET /events/{eventId}/Rounds.json

type Round struct {
	ID          Guid   `json:"ID"`
	Name        string `json:"Name"`
	RoundNumber int    `json:"RoundNumber"`
	EventType   string `json:"EventType"`
	RoundType   string `json:"RoundType"`
	Valid       bool   `json:"Valid"`
	Order       int    `json:"Order"`
}

type RoundsFile = []Round

// Race
// GET /events/{eventId}/{raceId}/Race.json (array with 1 item)

type Detection struct {
	ID                Guid   `json:"ID"`
	TimingSystemIndex int    `json:"TimingSystemIndex"`
	Channel           Guid   `json:"Channel"`
	Time              string `json:"Time"`
	Peak              int    `json:"Peak"`
	TimingSystemType  string `json:"TimingSystemType"`
	Pilot             Guid   `json:"Pilot"`
	LapNumber         int    `json:"LapNumber"`
	Valid             bool   `json:"Valid"`
	ValidityType      string `json:"ValidityType"`
	IsLapEnd          bool   `json:"IsLapEnd"`
	RaceSector        int    `json:"RaceSector"`
	IsHoleshot        bool   `json:"IsHoleshot"`
}

type Lap struct {
	ID            Guid    `json:"ID"`
	Detection     Guid    `json:"Detection"`
	LengthSeconds float64 `json:"LengthSeconds"`
	LapNumber     int     `json:"LapNumber"`
	StartTime     string  `json:"StartTime"`
	EndTime       string  `json:"EndTime"`
}

type GamePoint struct {
	ID      Guid   `json:"ID"`
	Channel Guid   `json:"Channel"`
	Pilot   Guid   `json:"Pilot"`
	Valid   bool   `json:"Valid"`
	Time    string `json:"Time"`
}

type Race struct {
	ID              Guid        `json:"ID"`
	Laps            []Lap       `json:"Laps"`
	Detections      []Detection `json:"Detections"`
	GamePoints      []GamePoint `json:"GamePoints"`
	Start           string      `json:"Start"`
	End             string      `json:"End"`
	TotalPausedTime string      `json:"TotalPausedTime"`
	PilotChannels   []struct {
		ID      Guid
		Pilot   Guid
		Channel Guid
	} `json:"PilotChannels"`
	RaceNumber                  int    `json:"RaceNumber"`
	Round                       Guid   `json:"Round"`
	TargetLaps                  int    `json:"TargetLaps"`
	PrimaryTimingSystemLocation string `json:"PrimaryTimingSystemLocation"`
	Valid                       bool   `json:"Valid"`
	Event                       Guid   `json:"Event"`
	Bracket                     string `json:"Bracket"`
}

type RaceFile = []Race

// Results
// GET /events/{eventId}/Results.json and per-race Result.json

type Result struct {
	ID         Guid   `json:"ID"`
	Points     int    `json:"Points"`
	Position   int    `json:"Position"`
	Valid      bool   `json:"Valid"`
	Event      Guid   `json:"Event"`
	Pilot      Guid   `json:"Pilot"`
	Race       Guid   `json:"Race"`
	Round      Guid   `json:"Round"`
	DNF        bool   `json:"DNF"`
	ResultType string `json:"ResultType"`
}

type ResultsFile = []Result


