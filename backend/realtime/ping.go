package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/subscriptions"
	"golang.org/x/sync/errgroup"
)

const (
	// PingTopic is the realtime subscription name used for SSE heartbeat messages.
	PingTopic = "pb_ping"

	// defaultPingInterval defines the fallback cadence for ping broadcasts when
	// the caller doesn't specify one.
	defaultPingInterval = 10 * time.Second

	// clientsChunkSize mirrors the default PocketBase chunk size to avoid sending
	// a message to too many clients in a single goroutine.
	clientsChunkSize = 300
)

// StartPingLoop launches a background worker that periodically broadcasts a heartbeat
// message on PingTopic. The loop stops once ctx is cancelled.
func StartPingLoop(ctx context.Context, app core.App, interval time.Duration) {
	if interval <= 0 {
		interval = defaultPingInterval
	}

	ticker := time.NewTicker(interval)

	go func() {
		defer ticker.Stop()

		// Send a ping immediately so idle clients get a fresh event shortly after subscribe.
		broadcastPing(app)

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				broadcastPing(app)
			}
		}
	}()
}

func broadcastPing(app core.App) {
	payload := map[string]any{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := notify(app, PingTopic, payload); err != nil {
		slog.Warn("pbrealtime.ping.broadcast_error", "err", err)
	}
}

func notify(app core.App, subscription string, data any) error {
	rawData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	message := subscriptions.Message{
		Name: subscription,
		Data: rawData,
	}

	chunks := app.SubscriptionsBroker().ChunkedClients(clientsChunkSize)

	group := new(errgroup.Group)
	for _, chunk := range chunks {
		chunk := chunk
		group.Go(func() error {
			for _, client := range chunk {
				if !client.HasSubscription(subscription) {
					continue
				}
				client.Send(message)
			}
			return nil
		})
	}

	return group.Wait()
}
