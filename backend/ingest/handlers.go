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
            count, rerr := service.IngestResults(eventId)
            if rerr != nil {
                return c.JSON(http.StatusInternalServerError, map[string]any{
                    "ok":      false,
                    "message": "Results ingestion failed",
                    "error":   rerr.Error(),
                })
            }
            return c.JSON(http.StatusOK, map[string]any{"ok": true, "count": count})
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
            summary, ferr := service.Full(eventId)
            if ferr != nil {
                // Return a richer error payload including the detailed error message and partial summary
                return c.JSON(http.StatusInternalServerError, map[string]any{
                    "ok":      false,
                    "message": "Full ingestion failed",
                    "error":   ferr.Error(),
                    "summary": summary,
                })
            }
            return c.JSON(http.StatusOK, summary)
        })
        return se.Next()
    })
}
