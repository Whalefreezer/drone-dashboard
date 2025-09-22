package control

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

type traceKeyType struct{}

var traceKey traceKeyType

// WithTraceID returns a context derived from ctx carrying the provided trace ID.
func WithTraceID(ctx context.Context, traceID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, traceKey, traceID)
}

// TraceIDFromContext extracts a trace ID from ctx if present.
func TraceIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if v, ok := ctx.Value(traceKey).(string); ok {
		return v
	}
	return ""
}

// EnsureTraceID guarantees a trace ID on the returned context and provides it.
func EnsureTraceID(ctx context.Context) (context.Context, string) {
	if ctx == nil {
		ctx = context.Background()
	}
	if id := TraceIDFromContext(ctx); id != "" {
		return ctx, id
	}
	id := newTraceID()
	return WithTraceID(ctx, id), id
}

func newTraceID() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Fallback to timestamp-like hex when entropy fails.
		return hex.EncodeToString([]byte("tracefallback"))
	}
	return hex.EncodeToString(b[:])
}

// TraceCarrier represents errors that expose an associated trace ID.
type TraceCarrier interface {
	error
	TraceID() string
}

// TraceError wraps an error with the originating trace ID.
type TraceError struct {
	traceID string
	err     error
}

// NewTraceError creates a TraceError for the provided trace ID and error.
func NewTraceError(traceID string, err error) error {
	if err == nil {
		return nil
	}
	if traceID == "" {
		return err
	}
	// Avoid double wrapping TraceError.
	if existing, ok := err.(TraceCarrier); ok {
		if existing.TraceID() == traceID {
			return err
		}
	}
	return &TraceError{traceID: traceID, err: err}
}

func (e *TraceError) Error() string {
	if e == nil {
		return ""
	}
	if e.traceID == "" {
		return e.err.Error()
	}
	return fmt.Sprintf("%s (traceId=%s)", e.err.Error(), e.traceID)
}

func (e *TraceError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.err
}

func (e *TraceError) TraceID() string {
	if e == nil {
		return ""
	}
	return e.traceID
}

func (e *TraceError) String() string {
	if e == nil {
		return ""
	}
	return e.Error()
}
