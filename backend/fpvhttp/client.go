package fpvhttp

import (
	"context"
	"net/http"
	"sync"
	"time"
)

var (
	clientOnce sync.Once
	client     *http.Client
)

const (
	requestTimeout       = 1 * time.Second
	requestThrottleDelay = 5 * time.Millisecond
	sleepStep            = 5 * time.Millisecond
)

// Shared returns the shared HTTP client used for FPVTrackside calls.
// It enforces MaxConnsPerHost=1 and introduces a minimum delay between
// sequential requests to avoid overloading FPVTrackside.
func Shared() *http.Client {
	clientOnce.Do(func() {
		transport := &http.Transport{
			DisableKeepAlives: true,
			MaxConnsPerHost:   1,
		}

		client = &http.Client{
			Timeout:   requestTimeout,
			Transport: newThrottledTransport(transport, requestThrottleDelay),
		}
	})
	return client
}

type throttledTransport struct {
	inner  http.RoundTripper
	minGap time.Duration

	mu       sync.Mutex
	lastStop time.Time
	inflight bool
}

func newThrottledTransport(inner http.RoundTripper, minGap time.Duration) http.RoundTripper {
	if inner == nil || minGap <= 0 {
		return inner
	}

	t := &throttledTransport{
		inner:  inner,
		minGap: minGap,
	}
	return t
}

func (t *throttledTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if t == nil || t.inner == nil {
		return http.DefaultTransport.RoundTrip(req)
	}

	if err := t.waitTurn(req.Context()); err != nil {
		return nil, err
	}
	defer t.finish()

	return t.inner.RoundTrip(req)
}

func (t *throttledTransport) waitTurn(ctx context.Context) error {
	for {
		t.mu.Lock()

		if t.inflight {
			t.mu.Unlock()
			if err := sleepWithContext(ctx, sleepStep); err != nil {
				return err
			}
			continue
		}

		wait := time.Until(t.lastStop.Add(t.minGap))
		if wait > 0 {
			t.mu.Unlock()
			if err := sleepWithContext(ctx, wait); err != nil {
				return err
			}
			continue
		}

		t.inflight = true
		t.mu.Unlock()
		return nil
	}
}

func (t *throttledTransport) finish() {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.inflight = false
	t.lastStop = time.Now()
}

func (t *throttledTransport) CloseIdleConnections() {
	if closer, ok := t.inner.(interface{ CloseIdleConnections() }); ok {
		closer.CloseIdleConnections()
	}
}

func sleepWithContext(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return nil
	}

	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
