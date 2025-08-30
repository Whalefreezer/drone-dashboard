package ingest

import (
    "github.com/pocketbase/pocketbase/core"
)

type Service struct {
    Client   *FPVClient
    Upserter *Upserter
}

func NewService(app core.App, baseURL string) (*Service, error) {
    client, err := NewFPVClient(baseURL)
    if err != nil {
        return nil, err
    }
    return &Service{Client: client, Upserter: NewUpserter(app)}, nil
}
