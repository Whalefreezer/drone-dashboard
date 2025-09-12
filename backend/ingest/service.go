package ingest

import (
	"github.com/pocketbase/pocketbase/core"
)

type Service struct {
	Source   Source
	Upserter *Upserter
}

func NewService(app core.App, baseURL string) (*Service, error) {
	client, err := NewFPVClient(baseURL)
	if err != nil {
		return nil, err
	}
	return &Service{Source: DirectSource{C: client}, Upserter: NewUpserter(app)}, nil
}

func NewServiceWithSource(app core.App, src Source) *Service {
	return &Service{Source: src, Upserter: NewUpserter(app)}
}
