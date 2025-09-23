package control

import (
	"database/sql"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// ErrNoCurrentRace indicates that no current race information is available yet.
var ErrNoCurrentRace = errors.New("control: no current race")

// CurrentRaceInfo captures the source identifiers for the active event and race.
type CurrentRaceInfo struct {
	EventSourceID string
	RaceSourceID  string
}

// CurrentRaceProvider exposes the current race identifiers for classification.
type CurrentRaceProvider interface {
	CurrentRace() (CurrentRaceInfo, error)
}

type clientKVCurrentRaceProvider struct {
	app core.App
	ttl time.Duration

	mu       sync.Mutex
	cache    CurrentRaceInfo
	cachedAt time.Time
	lastErr  error
}

// NewClientKVCurrentRaceProvider returns a CurrentRaceProvider backed by PocketBase client_kv records.
func NewClientKVCurrentRaceProvider(app core.App, ttl time.Duration) CurrentRaceProvider {
	if ttl <= 0 {
		ttl = 500 * time.Millisecond
	}
	return &clientKVCurrentRaceProvider{app: app, ttl: ttl}
}

func (p *clientKVCurrentRaceProvider) CurrentRace() (CurrentRaceInfo, error) {
	if p.app == nil {
		return CurrentRaceInfo{}, ErrNoCurrentRace
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now()
	if !p.cachedAt.IsZero() && now.Sub(p.cachedAt) <= p.ttl {
		return p.cache, p.lastErr
	}

	info, err := p.fetchCurrentRace()
	p.cache = info
	p.cachedAt = now
	if err != nil {
		p.lastErr = err
	} else {
		p.lastErr = nil
	}
	return info, err
}

func (p *clientKVCurrentRaceProvider) fetchCurrentRace() (CurrentRaceInfo, error) {
	rec, err := p.app.FindFirstRecordByFilter("events", "isCurrent = true", nil)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return CurrentRaceInfo{}, ErrNoCurrentRace
		}
		return CurrentRaceInfo{}, err
	}
	if rec == nil {
		return CurrentRaceInfo{}, ErrNoCurrentRace
	}
	eventSourceID := rec.GetString("sourceId")
	eventPBID := rec.Id
	if eventPBID == "" {
		return CurrentRaceInfo{}, ErrNoCurrentRace
	}

	kv, err := p.app.FindFirstRecordByFilter(
		"client_kv",
		"namespace = {:ns} && key = {:key} && event = {:event}",
		dbx.Params{"ns": "race", "key": "currentOrder", "event": eventPBID},
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return CurrentRaceInfo{EventSourceID: eventSourceID}, ErrNoCurrentRace
		}
		return CurrentRaceInfo{}, err
	}
	if kv == nil {
		return CurrentRaceInfo{EventSourceID: eventSourceID}, ErrNoCurrentRace
	}

	var payload struct {
		SourceID string `json:"sourceId"`
	}
	value := kv.GetString("value")
	if value == "" {
		return CurrentRaceInfo{EventSourceID: eventSourceID}, ErrNoCurrentRace
	}
	if err := json.Unmarshal([]byte(value), &payload); err != nil {
		return CurrentRaceInfo{}, err
	}
	if payload.SourceID == "" {
		return CurrentRaceInfo{EventSourceID: eventSourceID}, ErrNoCurrentRace
	}

	return CurrentRaceInfo{EventSourceID: eventSourceID, RaceSourceID: payload.SourceID}, nil
}
