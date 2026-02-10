package main

import (
	"embed"
	"log"
	"log/slog"

	"drone-dashboard/bootstrap/config"
	"drone-dashboard/bootstrap/mode"
	"drone-dashboard/bootstrap/server"
	"drone-dashboard/ingest"
	"drone-dashboard/logger"
	_ "drone-dashboard/migrations"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	flags := config.ParseFlags()
	staticContent := config.MustStaticFS(staticFiles)

	logger.Configure(flags.LogLevel)

	app := config.NewPocketBaseApp(flags)

	pbArgs := config.PreparePocketBaseArgs(flags)
	slog.Debug("PocketBase args", "args", pbArgs)
	app.RootCmd.SetArgs(pbArgs)

	ingestService, manager := mode.Build(app, flags)
	ingest.RegisterRoutes(app, ingestService)
	manager.RegisterHooks()

	server.RegisterServe(app, staticContent, ingestService, manager, flags)

	if err := app.Start(); err != nil {
		log.Fatal("PocketBase startup error:", err)
	}
}
