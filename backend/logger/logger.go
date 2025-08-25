package logger

import (
    "log/slog"
    "os"
    "strings"
)

// levelVar holds the current log level; defaults to Info.
var levelVar slog.LevelVar

// logger is the package-wide logger configured with TextHandler.
var logger = slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: &levelVar}))

func init() {
    // Default level Info; can be overridden via Configure.
    levelVar.Set(slog.LevelInfo)
    slog.SetDefault(logger)
}

// Configure sets the global logger level from a string value.
// Supported: "error", "warn", "info", "debug", "trace".
func Configure(level string) {
    switch strings.ToLower(strings.TrimSpace(level)) {
    case "error":
        levelVar.Set(slog.LevelError)
    case "warn", "warning":
        levelVar.Set(slog.LevelWarn)
    case "info", "":
        levelVar.Set(slog.LevelInfo)
    case "debug":
        levelVar.Set(slog.LevelDebug)
    case "trace":
        // custom "trace" below debug
        levelVar.Set(slog.Level(-8))
    default:
        levelVar.Set(slog.LevelInfo)
    }
}

// L returns the global logger.
func L() *slog.Logger { return logger }

