package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"drone-dashboard/fpvhttp"
)

// FPVClient fetches FPVTrackside Browser API via the configured base URL.
type FPVClient struct {
	BaseURL *url.URL
}

func NewFPVClient(base string) (*FPVClient, error) {
	u, err := url.Parse(base)
	if err != nil {
		return nil, err
	}
	return &FPVClient{BaseURL: u}, nil
}

func (c *FPVClient) GetBytes(path string) ([]byte, error) {
	u := *c.BaseURL
	u.Path = path
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := fpvhttp.Shared().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GET %s: status %d: %s", u.String(), resp.StatusCode, string(b))
	}
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if len(b) == 0 {
		return nil, fmt.Errorf("GET %s: empty response body", u.String())
	}
	return b, nil
}

func (c *FPVClient) getJSON(path string, v any) error {
	b, err := c.GetBytes(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(b, v); err != nil {
		snippet := string(b)
		if len(snippet) > 200 {
			snippet = snippet[:200] + "..."
		}
		return fmt.Errorf("decode %s: %v; body: %s", c.BaseURL.String()+path, err, snippet)
	}
	return nil
}

// FetchEvent fetches event data from the external system
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (c *FPVClient) FetchEvent(eventSourceId string) (EventFile, error) {
	var out EventFile
	err := c.getJSON(fmt.Sprintf("/events/%s/Event.json", eventSourceId), &out)
	return out, err
}

// FetchPilots fetches pilot data from the external system
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (c *FPVClient) FetchPilots(eventSourceId string) (PilotsFile, error) {
	var out PilotsFile
	err := c.getJSON(fmt.Sprintf("/events/%s/Pilots.json", eventSourceId), &out)
	return out, err
}

func (c *FPVClient) FetchChannels() (ChannelsFile, error) {
	var out ChannelsFile
	err := c.getJSON("/httpfiles/Channels.json", &out)
	return out, err
}

// FetchRounds fetches round data from the external system
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (c *FPVClient) FetchRounds(eventSourceId string) (RoundsFile, error) {
	var out RoundsFile
	err := c.getJSON(fmt.Sprintf("/events/%s/Rounds.json", eventSourceId), &out)
	return out, err
}

// FetchRace fetches race data from the external system
// eventSourceId: The external system's event identifier (not PocketBase ID)
// raceId: The external system's race identifier (not PocketBase ID)
func (c *FPVClient) FetchRace(eventSourceId, raceId string) (RaceFile, error) {
	var out RaceFile
	err := c.getJSON(fmt.Sprintf("/events/%s/%s/Race.json", eventSourceId, raceId), &out)
	return out, err
}

// FetchResults fetches results data from the external system
// eventSourceId: The external system's event identifier (not PocketBase ID)
func (c *FPVClient) FetchResults(eventSourceId string) (ResultsFile, error) {
	var out ResultsFile
	// custom handling: empty body means no results yet
	u := *c.BaseURL
	u.Path = fmt.Sprintf("/events/%s/Results.json", eventSourceId)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return out, err
	}
	resp, err := fpvhttp.Shared().Do(req)
	if err != nil {
		return out, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return out, fmt.Errorf("GET %s: status %d: %s", u.String(), resp.StatusCode, string(b))
	}
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return out, err
	}
	if len(b) == 0 || len(strings.TrimSpace(string(b))) == 0 {
		// treat empty as no results
		return ResultsFile{}, nil
	}
	if err := json.Unmarshal(b, &out); err != nil {
		snippet := string(b)
		if len(snippet) > 200 {
			snippet = snippet[:200] + "..."
		}
		return out, fmt.Errorf("decode %s: %v; body: %s", u.String(), err, snippet)
	}
	return out, nil
}

// FetchEventSourceId fetches the current event source ID from the external system using the same regex as the frontend
func (c *FPVClient) FetchEventSourceId() (string, error) {
	u := *c.BaseURL
	u.Path = "/"
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return "", err
	}
	resp, err := fpvhttp.Shared().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("GET %s: status %d: %s", u.String(), resp.StatusCode, string(b))
	}
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	text := string(b)

	// Use the same regex as the frontend
	match := regexp.MustCompile(`var eventManager = new EventManager\("events\/([a-z0-9-]+)"`).FindStringSubmatch(text)
	if match != nil && len(match) > 1 {
		return match[1], nil
	}
	return "", fmt.Errorf("event ID not found in response")
}
