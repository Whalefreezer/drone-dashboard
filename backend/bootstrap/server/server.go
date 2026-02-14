package server

import (
	"context"
	"crypto/rand"
	"fmt"
	"io/fs"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"drone-dashboard/bootstrap/config"
	"drone-dashboard/importer"
	"drone-dashboard/ingest"
	"drone-dashboard/realtime"
	"drone-dashboard/scheduler"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func RegisterServe(app *pocketbase.PocketBase, static fs.FS, ingestService *ingest.Service, manager *scheduler.Manager, flags config.Flags) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		staticHandler := apis.Static(static, true)
		var frontendDevProxy *httputil.ReverseProxy
		if strings.TrimSpace(flags.FrontendDevURL) != "" {
			devURL, err := url.Parse(flags.FrontendDevURL)
			if err != nil {
				return fmt.Errorf("invalid frontend-dev-url %q: %w", flags.FrontendDevURL, err)
			}
			frontendDevProxy = httputil.NewSingleHostReverseProxy(devURL)
			frontendDevProxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
				slog.Warn("frontend.dev_proxy.error",
					"target", flags.FrontendDevURL,
					"path", r.URL.Path,
					"err", err,
				)
				http.Error(w, "frontend dev server unavailable", http.StatusBadGateway)
			}
		}

		if err := ensureSuperuser(app); err != nil {
			return fmt.Errorf("failed to ensure superuser: %w", err)
		}

		if flags.ImportSnapshot != "" {
			if err := importer.ImportFromFile(app, flags.ImportSnapshot); err != nil {
				return fmt.Errorf("import snapshot: %w", err)
			}
		}

		setSchedulerEnabledFromFlag(app, flags.IngestEnabled)
		setUITitleFromFlag(app, flags.UITitle, flags.UITitleProvided)

		ctx := context.Background()
		manager.StartLoops(ctx)

		pingCtx, cancelPing := context.WithCancel(context.Background())
		if se.Server != nil {
			se.Server.RegisterOnShutdown(cancelPing)
		} else {
			defer cancelPing()
		}
		realtime.StartPingLoop(pingCtx, app, 10*time.Second)

		se.Router.Any("/direct/{path...}", func(c *core.RequestEvent) error {
			if !flags.DirectProxy {
				return c.NotFoundError("not found", nil)
			}
			ds, ok := ingestService.Source.(ingest.DirectSource)
			if !ok {
				return c.NotFoundError("not found", nil)
			}
			req := c.Request
			resp := c.Response
			srcPath := req.PathValue("path")
			bytes, err := ds.C.GetBytes(srcPath)
			if err != nil {
				slog.Warn("http.direct.fetch.error", "path", srcPath, "err", err)
				return c.InternalServerError("fetch event", err)
			}
			resp.WriteHeader(http.StatusOK)
			resp.Write([]byte(string(bytes)))
			return nil
		})

		se.Router.GET("/health", func(c *core.RequestEvent) error {
			return c.JSON(http.StatusOK, map[string]interface{}{
				"status":    "ok",
				"timestamp": fmt.Sprintf("%d", time.Now().Unix()),
			})
		})

		se.Router.Any("/{path...}", func(c *core.RequestEvent) error {
			if frontendDevProxy != nil && shouldProxyFrontendPath(c.Request.URL.Path) {
				frontendDevProxy.ServeHTTP(c.Response, c.Request)
				return nil
			}
			return staticHandler(c)
		})

		if flags.AuthToken != "" && flags.CloudURL == "" {
			slog.Info("Cloud mode: waiting for pits connection; WS control on /control")
		} else {
			slog.Debug("Pointing to FPVTrackside API", "url", flags.FPVTrackside)
			if frontendDevProxy != nil {
				slog.Info("Frontend dev proxy enabled", "target", flags.FrontendDevURL)
			}
			if flags.DirectProxy {
				slog.Info("Direct proxy enabled", "route", "/direct/*", "target", flags.FPVTrackside)
			} else {
				slog.Debug("Direct proxy disabled (enable with -direct-proxy)")
			}
		}
		printDashboardBox(flags)
		return se.Next()
	})
}

func shouldProxyFrontendPath(path string) bool {
	if path == "/health" {
		return false
	}
	if strings.HasPrefix(path, "/api") {
		return false
	}
	if strings.HasPrefix(path, "/_/") || path == "/_" {
		return false
	}
	if strings.HasPrefix(path, "/direct/") {
		return false
	}
	if strings.HasPrefix(path, "/control") {
		return false
	}
	return true
}

func printDashboardBox(flags config.Flags) {
	const contentWidth = 57

	formatLine := func(icon, label, value string) string {
		const labelWidth = 15
		paddedLabel := fmt.Sprintf("%-*s", labelWidth, label)
		content := fmt.Sprintf("  %s %s: %s", icon, paddedLabel, value)
		padding := ""
		if len(content) < contentWidth {
			padding = strings.Repeat(" ", contentWidth-len(content)+2)
		}
		return fmt.Sprintf("║%s%s║", content, padding)
	}

	fmt.Printf("\n")
	fmt.Printf("╔%s╗\n", strings.Repeat("═", contentWidth))
	fmt.Printf("║%s║\n", centerText("🚀 DRONE DASHBOARD", contentWidth))
	fmt.Printf("╠%s╣\n", strings.Repeat("═", contentWidth))

	fmt.Println(formatLine("🌐", "Main Dashboard", fmt.Sprintf("http://0.0.0.0:%d", flags.Port)))
	fmt.Println(formatLine("🔧", "DB Admin Panel", fmt.Sprintf("http://0.0.0.0:%d/_/", flags.Port)))

	if flags.AuthToken != "" && flags.CloudURL == "" {
		fmt.Println(formatLine("🔧", "Control Link", fmt.Sprintf("ws://0.0.0.0:%d/control", flags.Port)))
	} else {
		fmt.Println(formatLine("📡", "FPVTrackside", flags.FPVTrackside))
	}

	fmt.Printf("╚%s╝\n", strings.Repeat("═", contentWidth))
	fmt.Printf("\n")
}

func centerText(text string, width int) string {
	if len(text) >= width {
		return text
	}
	padding := (width - len(text)) / 2
	leftPad := strings.Repeat(" ", padding)
	rightPad := strings.Repeat(" ", width-len(text)-padding+2)
	return leftPad + text + rightPad
}

func setSchedulerEnabledFromFlag(app core.App, enabled bool) {
	col, err := app.FindCollectionByNameOrId("server_settings")
	if err != nil {
		slog.Warn("server_settings.collection.find.error", "err", err)
		return
	}
	rec, _ := app.FindFirstRecordByFilter("server_settings", "key = 'scheduler.enabled'", nil)
	if rec == nil {
		rec = core.NewRecord(col)
		rec.Set("key", "scheduler.enabled")
	}
	rec.Set("value", strconv.FormatBool(enabled))
	if err := app.Save(rec); err != nil {
		slog.Warn("server_settings.save.error", "key", "scheduler.enabled", "err", err)
	}
}

func setUITitleFromFlag(app core.App, title string, provided bool) {
	if !provided {
		return
	}
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		trimmed = "Drone Dashboard"
	}
	col, err := app.FindCollectionByNameOrId("server_settings")
	if err != nil {
		slog.Warn("server_settings.collection.find.error", "err", err)
		return
	}
	rec, _ := app.FindFirstRecordByFilter("server_settings", "key = 'ui.title'", nil)
	if rec == nil {
		rec = core.NewRecord(col)
		rec.Set("key", "ui.title")
	}
	rec.Set("value", trimmed)
	if err := app.Save(rec); err != nil {
		slog.Warn("server_settings.save.error", "key", "ui.title", "err", err)
	}
}

func ensureSuperuser(app core.App) error {
	email := os.Getenv("SUPERUSER_EMAIL")
	if email == "" {
		email = "admin@example.com"
	}
	password := os.Getenv("SUPERUSER_PASSWORD")
	generated := false
	if password == "" {
		if p, err := generatePassword(24); err == nil {
			password = p
			generated = true
		} else {
			return fmt.Errorf("failed to generate password: %w", err)
		}
	}

	superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return fmt.Errorf("failed to find superusers collection: %w", err)
	}

	existingRecord, _ := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
	if existingRecord != nil {
		slog.Info("superuser.ensure.skipped",
			"reason", "superuser already exists",
			"email", email)
		return nil
	}

	record := core.NewRecord(superusers)
	record.Set("email", email)
	record.Set("password", password)

	if err := app.Save(record); err != nil {
		return fmt.Errorf("failed to save superuser: %w", err)
	}

	if generated {
		slog.Info("superuser.ensure.created",
			"email", email,
			"password", password,
			"note", "password generated because SUPERUSER_PASSWORD was not set")
	} else {
		slog.Info("superuser.ensure.created",
			"email", email)
	}
	return nil
}

func generatePassword(length int) (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_"
	max := big.NewInt(int64(len(charset)))
	out := make([]byte, length)
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = charset[n.Int64()]
	}
	return string(out), nil
}
