package migrations

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const lastUpdatedFieldName = "lastUpdated"

func init() {
	m.Register(func(app core.App) error {
		targets := []struct {
			name    string
			index   bool
			idxName string
		}{
			{name: "events"},
			{name: "rounds"},
			{name: "pilots"},
			{name: "channels"},
			{name: "tracks"},
			{name: "races"},
			{name: "pilotChannels"},
			{name: "detections", index: true, idxName: "idx_detections_lastUpdated"},
			{name: "laps", index: true, idxName: "idx_laps_lastUpdated"},
			{name: "gamePoints"},
			{name: "results"},
			{name: "ingest_targets"},
			{name: "server_settings"},
			{name: "client_kv"},
			{name: "control_stats"},
		}

		for _, target := range targets {
			if err := ensureLastUpdatedField(app, target.name, target.index, target.idxName); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		targets := []struct {
			name    string
			index   bool
			idxName string
		}{
			{name: "control_stats"},
			{name: "client_kv"},
			{name: "server_settings"},
			{name: "ingest_targets"},
			{name: "results"},
			{name: "gamePoints"},
			{name: "laps", index: true, idxName: "idx_laps_lastUpdated"},
			{name: "detections", index: true, idxName: "idx_detections_lastUpdated"},
			{name: "pilotChannels"},
			{name: "races"},
			{name: "tracks"},
			{name: "channels"},
			{name: "pilots"},
			{name: "rounds"},
			{name: "events"},
		}

		for _, target := range targets {
			if err := removeLastUpdatedField(app, target.name, target.index, target.idxName); err != nil {
				return err
			}
		}

		return nil
	})
}

func ensureLastUpdatedField(app core.App, collectionName string, addIndex bool, indexName string) error {
	col, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	if col.Fields.GetByName(lastUpdatedFieldName) == nil {
		col.Fields.Add(&core.AutodateField{
			Name:     lastUpdatedFieldName,
			System:   true,
			OnCreate: true,
			OnUpdate: true,
		})
	}

	if addIndex && col.GetIndex(indexName) == "" {
		col.AddIndex(indexName, false, lastUpdatedFieldName, fmt.Sprintf("`%s` != ''", lastUpdatedFieldName))
	}

	if err := app.Save(col); err != nil {
		return err
	}

	if _, err := app.DB().NewQuery(fmt.Sprintf(
		"UPDATE `%s` SET `%s` = IIF(`%s` IS NULL OR `%s` = '', strftime('%%Y-%%m-%%dT%%H:%%M:%%fZ','now'), `%s`) WHERE `%s` IS NULL OR `%s` = ''",
		collectionName,
		lastUpdatedFieldName,
		lastUpdatedFieldName,
		lastUpdatedFieldName,
		lastUpdatedFieldName,
		lastUpdatedFieldName,
		lastUpdatedFieldName,
	)).Execute(); err != nil {
		return err
	}

	return nil
}

func removeLastUpdatedField(app core.App, collectionName string, hasIndex bool, indexName string) error {
	col, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}

	if hasIndex {
		col.RemoveIndex(indexName)
	}

	col.Fields.RemoveByName(lastUpdatedFieldName)

	return app.Save(col)
}
