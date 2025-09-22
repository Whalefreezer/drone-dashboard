package fpvhttp

import (
	"net/http"
	"sync"
	"time"
)

var (
	clientOnce sync.Once
	client     *http.Client
)

// Shared returns the shared HTTP client used for FPVTrackside calls.
// It enforces MaxConnsPerHost=1 to avoid overloading FPVTrackside.
func Shared() *http.Client {
	clientOnce.Do(func() {
		client = &http.Client{
			Timeout: 1 * time.Second,
			Transport: &http.Transport{
				DisableKeepAlives: true,
				MaxConnsPerHost:   1,
			},
		}
	})
	return client
}
