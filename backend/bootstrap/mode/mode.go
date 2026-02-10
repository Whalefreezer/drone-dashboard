package mode

import (
	"context"
	"log"
	"time"

	"drone-dashboard/bootstrap/config"
	"drone-dashboard/control"
	"drone-dashboard/ingest"
	"drone-dashboard/scheduler"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

func Build(app *pocketbase.PocketBase, flags config.Flags) (*ingest.Service, *scheduler.Manager) {
	hub := control.NewHub()
	hub.SetFetchStatsStore(control.NewPocketBaseFetchStatsStore(app))
	hub.SetCurrentRaceProvider(control.NewClientKVCurrentRaceProvider(app, time.Second))

	ingestService := selectIngestService(app, flags, hub)
	manager := scheduler.NewManager(app, ingestService, scheduler.Config{})
	return ingestService, manager
}

func selectIngestService(app *pocketbase.PocketBase, flags config.Flags, hub *control.Hub) *ingest.Service {
	if flags.AuthToken != "" {
		if flags.CloudURL != "" {
			ingestService := mustNewIngestService(app, flags.FPVTrackside)
			pc, err := control.NewPitsClient(flags.CloudURL, flags.AuthToken, flags.PitsID, flags.FPVTrackside)
			if err != nil {
				log.Fatal("control client init:", err)
			}
			go pc.Start(context.Background())
			return ingestService
		}

		control.RegisterServer(app, hub, flags.AuthToken)
		return ingest.NewServiceWithSource(app, ingest.NewRemoteSource(hub, flags.PitsID))
	}

	return mustNewIngestService(app, flags.FPVTrackside)
}

func mustNewIngestService(app core.App, baseURL string) *ingest.Service {
	svc, err := ingest.NewService(app, baseURL)
	if err != nil {
		log.Fatal("Failed to create proxy service:", err)
	}
	return svc
}
