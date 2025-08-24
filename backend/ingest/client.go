package ingest

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	return &FPVClient{BaseURL: u, HTTP: &http.Client{}}, nil
}

func (c *FPVClient) getJSON(path string, v any) error {
	u := *c.BaseURL
	u.Path = path
	resp, err := c.HTTP.Get(u.String())
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("GET %s: %s", u.String(), string(b))
	}
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, v)
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
	err := c.getJSON(fmt.Sprintf("/events/%s/Results.json", eventId), &out)
	return out, err
}
