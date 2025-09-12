package logger

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"time"
)

// ANSI color codes
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorYellow = "\033[33m"
	colorBlue   = "\033[34m"
	colorCyan   = "\033[36m"
	colorGray   = "\033[90m"
	colorBold   = "\033[1m"
)

// levelVar holds the current log level; defaults to Info.
var levelVar slog.LevelVar

// Custom handler that adds colors and formatting
type ColorHandler struct {
	handler slog.Handler
	writer  io.Writer
}

func (h *ColorHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.handler.Enabled(ctx, level)
}

func (h *ColorHandler) Handle(ctx context.Context, r slog.Record) error {
	// Determine level label and color
	level := r.Level.String()
	var color string
	switch r.Level {
	case slog.LevelError:
		color = colorRed + colorBold
		level = "ERROR"
	case slog.LevelWarn:
		color = colorYellow + colorBold
		level = "WARN"
	case slog.LevelInfo:
		color = colorBlue
		level = "INFO"
	case slog.LevelDebug:
		color = colorGray
		level = "DEBUG"
	default:
		if r.Level < 0 {
			color = colorGray
			level = "TRACE"
		}
	}

	// Create a new record that only contains attrs; we'll print
	// level, time, and message ourselves to control ordering.
	newRecord := slog.NewRecord(r.Time, r.Level, r.Message, r.PC)
	r.Attrs(func(a slog.Attr) bool {
		newRecord.AddAttrs(a)
		return true
	})

	// Write prefix: LEVEL timestamp message, each with distinct styling
	ts := r.Time.Format(time.RFC3339)
	if shouldUseColors() {
		// level (severity color) + timestamp (gray) + message (cyan)
		fmt.Fprintf(h.writer, "%s%s%s %s%s%s %s%s%s ",
			color, level, colorReset,
			colorGray, ts, colorReset,
			colorCyan, r.Message, colorReset,
		)
	} else {
		fmt.Fprintf(h.writer, "%s %s %s ", level, ts, r.Message)
	}

	// Delegate to text handler for the remaining keyed attrs only
	return h.handler.Handle(ctx, newRecord)
}

func (h *ColorHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &ColorHandler{
		handler: h.handler.WithAttrs(attrs),
		writer:  h.writer,
	}
}

func (h *ColorHandler) WithGroup(name string) slog.Handler {
	return &ColorHandler{
		handler: h.handler.WithGroup(name),
		writer:  h.writer,
	}
}

// logger is the package-wide logger configured with ColorHandler.
var logger *slog.Logger

func init() {
	// Check if colors should be disabled (e.g., for log files)
	useColors := shouldUseColors()

	var handler slog.Handler
	if useColors {
		handler = &ColorHandler{
			handler: slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
				Level:       &levelVar,
				ReplaceAttr: replaceAttrFunc,
			}),
			writer: os.Stdout,
		}
	} else {
		handler = &ColorHandler{
			handler: slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
				Level:       &levelVar,
				ReplaceAttr: replaceAttrFunc,
			}),
			writer: os.Stdout,
		}
	}

	logger = slog.New(handler)

	// Default level Info; can be overridden via Configure.
	levelVar.Set(slog.LevelInfo)
	slog.SetDefault(logger)
}

// shouldUseColors determines if ANSI colors should be used
func shouldUseColors() bool {
	// Disable colors if NO_COLOR is set or if output is not a terminal
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	// For now, always use colors. You could add terminal detection here
	return true
}

// replaceAttrFunc customizes attribute formatting
func replaceAttrFunc(groups []string, a slog.Attr) slog.Attr {
	// Drop default time/level/msg; we print those in our prefix
	switch a.Key {
	case slog.TimeKey, slog.LevelKey, slog.MessageKey:
		return slog.Attr{}
	}

	// Make error attributes more prominent when colors are enabled
	if a.Key == "error" || a.Key == "err" {
		if shouldUseColors() && a.Value.Kind() == slog.KindString {
			a.Value = slog.StringValue(colorRed + a.Value.String() + colorReset)
		}
	}
	return a
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
