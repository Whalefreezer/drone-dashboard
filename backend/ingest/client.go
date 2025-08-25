package ingest

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// FPVClient fetches FPVTrackside Browser API via the configured base URL.
type FPVClient struct {
	BaseURL *url.URL
	HTTP    *http.Client
}

func NewFPVClient(base string) (*FPVClient, error) {
	u, err := url.Parse(base)
	if err != nil {
		return nil, err
	}
	return &FPVClient{BaseURL: u, HTTP: &http.Client{
		Timeout: 1 * time.Second,
		Transport: &http.Transport{
			DisableKeepAlives: true,
			MaxConnsPerHost:   1,
		},
	}}, nil
}

func (c *FPVClient) GetBytes(path string) ([]byte, error) {
	u := *c.BaseURL
	u.Path = path
	resp, err := c.HTTP.Get(u.String())
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

func (c *FPVClient) FetchEvent(eventId string) (EventFile, error) {
	var out EventFile
	err := c.getJSON(fmt.Sprintf("/events/%s/Event.json", eventId), &out)
	return out, err
}

func (c *FPVClient) FetchPilots(eventId string) (PilotsFile, error) {
	var out PilotsFile
	err := c.getJSON(fmt.Sprintf("/events/%s/Pilots.json", eventId), &out)
	return out, err
}

func (c *FPVClient) FetchChannels() (ChannelsFile, error) {
	var out ChannelsFile
	err := c.getJSON("/httpfiles/Channels.json", &out)
	return out, err
}

func (c *FPVClient) FetchRounds(eventId string) (RoundsFile, error) {
	var out RoundsFile
	err := c.getJSON(fmt.Sprintf("/events/%s/Rounds.json", eventId), &out)
	return out, err
}

func (c *FPVClient) FetchRace(eventId, raceId string) (RaceFile, error) {
	var out RaceFile
	err := c.getJSON(fmt.Sprintf("/events/%s/%s/Race.json", eventId, raceId), &out)
	return out, err
}

func (c *FPVClient) FetchResults(eventId string) (ResultsFile, error) {
	var out ResultsFile
	// custom handling: empty body means no results yet
	u := *c.BaseURL
	u.Path = fmt.Sprintf("/events/%s/Results.json", eventId)
	resp, err := c.HTTP.Get(u.String())
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

// FetchEventId fetches the current event ID using the same regex as the frontend
func (c *FPVClient) FetchEventId() (string, error) {
	u := *c.BaseURL
	u.Path = "/"
	resp, err := c.HTTP.Get(u.String())
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
