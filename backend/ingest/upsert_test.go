package ingest

import (
	"errors"
	"fmt"
	"testing"
)

func TestIsEntityNotFound(t *testing.T) {
	t.Helper()
	err := &EntityNotFoundError{Collection: "rounds", SourceID: "abc"}
	if !IsEntityNotFound(err) {
		t.Fatalf("expected IsEntityNotFound to detect EntityNotFoundError")
	}
	wrapped := fmt.Errorf("wrapping: %w", err)
	if !IsEntityNotFound(wrapped) {
		t.Fatalf("expected IsEntityNotFound to unwrap EntityNotFoundError")
	}
	if !errors.Is(wrapped, err) {
		t.Fatalf("expected errors.Is to unwrap EntityNotFoundError")
	}
}

func TestIsEntityNotFoundFalse(t *testing.T) {
	t.Helper()
	if IsEntityNotFound(fmt.Errorf("other")) {
		t.Fatalf("expected IsEntityNotFound to return false for non-EntityNotFoundError")
	}
}
