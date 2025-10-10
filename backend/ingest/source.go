package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"drone-dashboard/control"
)

// Source abstracts where we fetch FPVTrackside-like data from.
type Source interface {
	FetchEvent(eventSourceId string) (EventFile, error)
	FetchPilots(eventSourceId string) (PilotsFile, error)
	FetchChannels() (ChannelsFile, error)
	FetchRounds(eventSourceId string) (RoundsFile, error)
	FetchRace(eventSourceId, raceId string) (RaceFile, error)
	FetchResults(eventSourceId string) (ResultsFile, error)
	FetchEventSourceId() (string, error)
}

// DirectSource wraps the existing FPVClient.
type DirectSource struct{ C *FPVClient }

func (d DirectSource) FetchEvent(eventSourceId string) (EventFile, error) {
	return d.C.FetchEvent(eventSourceId)
}
func (d DirectSource) FetchPilots(eventSourceId string) (PilotsFile, error) {
	return d.C.FetchPilots(eventSourceId)
}
func (d DirectSource) FetchChannels() (ChannelsFile, error) { return d.C.FetchChannels() }
func (d DirectSource) FetchRounds(eventSourceId string) (RoundsFile, error) {
	return d.C.FetchRounds(eventSourceId)
}
func (d DirectSource) FetchRace(eventSourceId, raceId string) (RaceFile, error) {
	return d.C.FetchRace(eventSourceId, raceId)
}
func (d DirectSource) FetchResults(eventSourceId string) (ResultsFile, error) {
	return d.C.FetchResults(eventSourceId)
}
func (d DirectSource) FetchEventSourceId() (string, error) { return d.C.FetchEventSourceId() }

// RemoteSource uses the control hub to fetch via pits.
type RemoteSource struct {
	Hub    *control.Hub
	PitsID string
	// simple per-path cache of last ETag/body to leverage 304s
	cacheMu sync.RWMutex
	cache   map[string]cached
}
type cached struct {
	etag string
	body []byte
}

func NewRemoteSource(h *control.Hub, pitsID string) *RemoteSource {
	return &RemoteSource{Hub: h, PitsID: pitsID, cache: make(map[string]cached)}
}

const (
	cloudFetchTimeout = 3 * time.Second
	pitsHTTPTimeoutMs = 1000
)

func (r *RemoteSource) fetchJSON(path string, out any) error {
	ctx, cancel := context.WithTimeout(context.Background(), cloudFetchTimeout)
	defer cancel()
	ctx, traceID := control.EnsureTraceID(ctx)
	var ifNone string
	r.cacheMu.RLock()
	if c, ok := r.cache[path]; ok {
		ifNone = c.etag
	}
	r.cacheMu.RUnlock()
	resp, err := r.Hub.DoFetch(ctx, r.PitsID, control.Fetch{Method: http.MethodGet, Path: path, IfNoneMatch: ifNone, TimeoutMs: pitsHTTPTimeoutMs, TraceID: traceID})
	if err != nil {
		return err
	}
	status, hdrs, body := control.DecodeResponse(resp)
	if status == http.StatusNotModified {
		r.cacheMu.RLock()
		c, ok := r.cache[path]
		r.cacheMu.RUnlock()
		if ok {
			body = c.body
		} else {
			return fmt.Errorf("304 but no cache for %s", path)
		}
	}
	etag, _ := hdrs["ETag"]
	if err := json.Unmarshal(body, out); err != nil {
		// Do not cache invalid payloads
		return err
	}
	if etag != "" {
		r.cacheMu.Lock()
		r.cache[path] = cached{etag: etag, body: body}
		r.cacheMu.Unlock()
	}
	return nil
}

func (r *RemoteSource) FetchEvent(eventSourceId string) (EventFile, error) {
	var o EventFile
	err := r.fetchJSON("/events/"+eventSourceId+"/Event.json", &o)
	return o, err
}
func (r *RemoteSource) FetchPilots(eventSourceId string) (PilotsFile, error) {
	var o PilotsFile
	err := r.fetchJSON("/events/"+eventSourceId+"/Pilots.json", &o)
	return o, err
}
func (r *RemoteSource) FetchChannels() (ChannelsFile, error) {
	var o ChannelsFile
	err := r.fetchJSON("/httpfiles/Channels.json", &o)
	return o, err
}
func (r *RemoteSource) FetchRounds(eventSourceId string) (RoundsFile, error) {
	var o RoundsFile
	err := r.fetchJSON("/events/"+eventSourceId+"/Rounds.json", &o)
	return o, err
}
func (r *RemoteSource) FetchRace(eventSourceId, raceId string) (RaceFile, error) {
	var o RaceFile
	err := r.fetchJSON("/events/"+eventSourceId+"/"+raceId+"/Race.json", &o)
	return o, err
}
func (r *RemoteSource) FetchResults(eventSourceId string) (ResultsFile, error) {
	var out ResultsFile
	path := "/events/" + eventSourceId + "/Results.json"
	ctx, cancel := context.WithTimeout(context.Background(), cloudFetchTimeout)
	defer cancel()
	ctx, traceID := control.EnsureTraceID(ctx)
	var ifNone string
	r.cacheMu.RLock()
	if c, ok := r.cache[path]; ok {
		ifNone = c.etag
	}
	r.cacheMu.RUnlock()
	resp, err := r.Hub.DoFetch(ctx, r.PitsID, control.Fetch{Method: http.MethodGet, Path: path, IfNoneMatch: ifNone, TimeoutMs: pitsHTTPTimeoutMs, TraceID: traceID})
	if err != nil {
		return out, err
	}
	status, hdrs, body := control.DecodeResponse(resp)
	if status == http.StatusNotModified {
		r.cacheMu.RLock()
		c, ok := r.cache[path]
		r.cacheMu.RUnlock()
		if ok {
			body = c.body
		} else {
			return out, fmt.Errorf("304 but no cache for %s", path)
		}
	}
	etag := hdrs["ETag"]
	// Special-case: Results.json is often 0 bytes; treat as empty results
	if len(strings.TrimSpace(string(body))) == 0 {
		if etag != "" {
			r.cacheMu.Lock()
			r.cache[path] = cached{etag: etag, body: body}
			r.cacheMu.Unlock()
		}
		return ResultsFile{}, nil
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return out, err
	}
	if etag != "" {
		r.cacheMu.Lock()
		r.cache[path] = cached{etag: etag, body: body}
		r.cacheMu.Unlock()
	}
	return out, nil
}
func (r *RemoteSource) FetchEventSourceId() (string, error) {
	// Fetch root page and scrape event id, mirroring FPVClient behavior
	ctx, cancel := context.WithTimeout(context.Background(), cloudFetchTimeout)
	defer cancel()
	ctx, traceID := control.EnsureTraceID(ctx)
	resp, err := r.Hub.DoFetch(ctx, r.PitsID, control.Fetch{Method: http.MethodGet, Path: "/", TimeoutMs: pitsHTTPTimeoutMs, TraceID: traceID})
	if err != nil {
		return "", err
	}
	_, _, body := control.DecodeResponse(resp)
	text := string(body)
	match := regexp.MustCompile(`var eventManager = new EventManager\("events\/([a-z0-9-]+)"`).FindStringSubmatch(text)
	if match != nil && len(match) > 1 {
		return match[1], nil
	}
	return "", fmt.Errorf("event ID not found in response")
}
