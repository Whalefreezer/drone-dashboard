package ingest

import (
	"net/http"

	"github.com/pocketbase/pocketbase/core"
)

// RegisterRoutes wires admin-only ingestion endpoints under /ingest/*
func RegisterRoutes(app core.App, baseProxy string) {
    app.OnServe().BindFunc(func(se *core.ServeEvent) error {
        se.Router.POST("/ingest/events/{eventId}/snapshot", func(c *core.RequestEvent) error {
            // admin-only guard (temporary: require superuser auth)
            info, err := c.RequestInfo()
            if err != nil || info.Auth == nil || !info.Auth.IsSuperuser() {
                return c.JSON(http.StatusUnauthorized, map[string]string{"error": "admin only"})
            }

            service, serr := NewService(c.App, baseProxy)
            if serr != nil {
                return c.InternalServerError("init service", serr)
            }

            eventId := c.Request.PathValue("eventId")
            if err := service.Snapshot(eventId); err != nil {
                return c.InternalServerError("snapshot failed", err)
            }
            return c.JSON(http.StatusOK, map[string]any{"ok": true})
        })

        se.Router.POST("/ingest/events/{eventId}/race/{raceId}", func(c *core.RequestEvent) error {
            info, err := c.RequestInfo()
            if err != nil || info.Auth == nil || !info.Auth.IsSuperuser() {
                return c.JSON(http.StatusUnauthorized, map[string]string{"error": "admin only"})
            }

            service, serr := NewService(c.App, baseProxy)
            if serr != nil {
                return c.InternalServerError("init service", serr)
            }

            eventId := c.Request.PathValue("eventId")
            raceId := c.Request.PathValue("raceId")
            if err := service.IngestRace(eventId, raceId); err != nil {
                return c.InternalServerError("race ingestion failed", err)
            }
            return c.JSON(http.StatusOK, map[string]any{"ok": true})
        })

        se.Router.POST("/ingest/events/{eventId}/results", func(c *core.RequestEvent) error {
            info, err := c.RequestInfo()
            if err != nil || info.Auth == nil || !info.Auth.IsSuperuser() {
                return c.JSON(http.StatusUnauthorized, map[string]string{"error": "admin only"})
            }

            service, serr := NewService(c.App, baseProxy)
            if serr != nil {
                return c.InternalServerError("init service", serr)
            }

            eventId := c.Request.PathValue("eventId")
            if err := service.IngestResults(eventId); err != nil {
                return c.InternalServerError("results ingestion failed", err)
            }
            return c.JSON(http.StatusOK, map[string]any{"ok": true})
        })

        se.Router.POST("/ingest/events/{eventId}/full", func(c *core.RequestEvent) error {
            info, err := c.RequestInfo()
            if err != nil || info.Auth == nil || !info.Auth.IsSuperuser() {
                return c.JSON(http.StatusUnauthorized, map[string]string{"error": "admin only"})
            }

            service, serr := NewService(c.App, baseProxy)
            if serr != nil {
                return c.InternalServerError("init service", serr)
            }

            eventId := c.Request.PathValue("eventId")
            summary, err := service.Full(eventId)
            if err != nil {
                return c.InternalServerError("full ingestion failed", err)
            }
            return c.JSON(http.StatusOK, summary)
        })
        return se.Next()
    })
}
