package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		// events
		events := core.NewBaseCollection("events")
		events.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.TextField{Name: "name", Required: true, Max: 255, Presentable: true},
			&core.TextField{Name: "eventType", Max: 32},
			&core.TextField{Name: "start", Max: 64},
			&core.TextField{Name: "end", Max: 64},
			&core.NumberField{Name: "laps"},
			&core.NumberField{Name: "pbLaps"},
			&core.NumberField{Name: "packLimit"},
			&core.TextField{Name: "raceLength", Max: 32},
			&core.TextField{Name: "minStartDelay", Max: 32},
			&core.TextField{Name: "maxStartDelay", Max: 32},
			&core.TextField{Name: "primaryTimingSystemLocation", Max: 32},
			&core.TextField{Name: "raceStartIgnoreDetections", Max: 32},
			&core.TextField{Name: "minLapTime", Max: 32},
			&core.TextField{Name: "lastOpened", Max: 64},
			&core.BoolField{Name: "isCurrent"},
		)
		events.AddIndex("ux_events_source", true, "source, sourceId", "")
		events.ListRule = types.Pointer("")
		events.ViewRule = types.Pointer("")
		if err := app.Save(events); err != nil {
			return err
		}

		// rounds
		rounds := core.NewBaseCollection("rounds")
		rounds.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.TextField{Name: "name", Max: 255, Presentable: true},
			&core.NumberField{Name: "roundNumber"},
			&core.TextField{Name: "eventType", Max: 32},
			&core.TextField{Name: "roundType", Max: 32},
			&core.BoolField{Name: "valid"},
			&core.NumberField{Name: "order"},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
		)
		rounds.AddIndex("ux_rounds_source", true, "source, sourceId", "")
		rounds.ListRule = types.Pointer("")
		rounds.ViewRule = types.Pointer("")
		if err := app.Save(rounds); err != nil {
			return err
		}

		// pilots
		pilots := core.NewBaseCollection("pilots")
		pilots.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.TextField{Name: "name", Required: true, Max: 255, Presentable: true},
			&core.TextField{Name: "firstName", Max: 128},
			&core.TextField{Name: "lastName", Max: 128},
			&core.TextField{Name: "discordId", Max: 64},
			&core.BoolField{Name: "practicePilot"},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
		)
		pilots.AddIndex("ux_pilots_source", true, "source, sourceId", "")
		pilots.ListRule = types.Pointer("")
		pilots.ViewRule = types.Pointer("")
		if err := app.Save(pilots); err != nil {
			return err
		}

		// channels
		channels := core.NewBaseCollection("channels")
		channels.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.NumberField{Name: "number"},
			&core.TextField{Name: "band", Max: 8},
			&core.TextField{Name: "shortBand", Max: 8},
			&core.TextField{Name: "channelPrefix", Max: 8},
			&core.NumberField{Name: "frequency"},
			&core.TextField{Name: "displayName", Max: 64, Presentable: true},
			&core.TextField{Name: "channelColor", Max: 32},
			&core.TextField{Name: "channelDisplayName", Max: 64},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
		)
		channels.AddIndex("ux_channels_source", true, "source, sourceId", "")
		channels.ListRule = types.Pointer("")
		channels.ViewRule = types.Pointer("")
		if err := app.Save(channels); err != nil {
			return err
		}

		// tracks
		tracks := core.NewBaseCollection("tracks")
		tracks.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.TextField{Name: "name", Max: 255, Presentable: true},
			&core.NumberField{Name: "length"},
			&core.NumberField{Name: "gridSize"},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
		)
		tracks.AddIndex("ux_tracks_source", true, "source, sourceId", "")
		tracks.ListRule = types.Pointer("")
		tracks.ViewRule = types.Pointer("")
		if err := app.Save(tracks); err != nil {
			return err
		}

		// races
		races := core.NewBaseCollection("races")
		races.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.NumberField{Name: "raceNumber"},
			&core.TextField{Name: "start", Max: 64},
			&core.TextField{Name: "end", Max: 64},
			&core.TextField{Name: "totalPausedTime", Max: 32},
			&core.TextField{Name: "primaryTimingSystemLocation", Max: 32},
			&core.BoolField{Name: "valid"},
			&core.TextField{Name: "bracket", Max: 32},
			&core.NumberField{Name: "targetLaps"},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
			&core.RelationField{Name: "round", CollectionId: rounds.Id, MaxSelect: 1},
		)
		races.AddIndex("ux_races_source", true, "source, sourceId", "")
		races.ListRule = types.Pointer("")
		races.ViewRule = types.Pointer("")
		if err := app.Save(races); err != nil {
			return err
		}

		// pilotChannels
		pilotChannels := core.NewBaseCollection("pilotChannels")
		pilotChannels.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.RelationField{Name: "pilot", CollectionId: pilots.Id, MaxSelect: 1},
			&core.RelationField{Name: "channel", CollectionId: channels.Id, MaxSelect: 1},
			&core.RelationField{Name: "race", CollectionId: races.Id, MaxSelect: 1},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
		)
		pilotChannels.AddIndex("ux_pilotChannels_source", true, "source, sourceId", "")
		pilotChannels.ListRule = types.Pointer("")
		pilotChannels.ViewRule = types.Pointer("")
		if err := app.Save(pilotChannels); err != nil {
			return err
		}

		// detections
		detections := core.NewBaseCollection("detections")
		detections.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.NumberField{Name: "timingSystemIndex"},
			&core.TextField{Name: "time", Max: 64},
			&core.NumberField{Name: "peak"},
			&core.TextField{Name: "timingSystemType", Max: 32},
			&core.NumberField{Name: "lapNumber"},
			&core.BoolField{Name: "valid"},
			&core.TextField{Name: "validityType", Max: 32},
			&core.BoolField{Name: "isLapEnd"},
			&core.NumberField{Name: "raceSector"},
			&core.BoolField{Name: "isHoleshot"},
			&core.RelationField{Name: "pilot", CollectionId: pilots.Id, MaxSelect: 1},
			&core.RelationField{Name: "race", CollectionId: races.Id, MaxSelect: 1},
			&core.RelationField{Name: "channel", CollectionId: channels.Id, MaxSelect: 1},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
		)
		detections.AddIndex("ux_detections_source", true, "source, sourceId", "")
		detections.ListRule = types.Pointer("")
		detections.ViewRule = types.Pointer("")
		if err := app.Save(detections); err != nil {
			return err
		}

		// laps
		laps := core.NewBaseCollection("laps")
		laps.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.NumberField{Name: "lapNumber"},
			&core.NumberField{Name: "lengthSeconds"},
			&core.TextField{Name: "startTime", Max: 64},
			&core.TextField{Name: "endTime", Max: 64},
			&core.RelationField{Name: "race", CollectionId: races.Id, MaxSelect: 1},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
		)
		laps.AddIndex("ux_laps_source", true, "source, sourceId", "")
		laps.ListRule = types.Pointer("")
		laps.ViewRule = types.Pointer("")
		if err := app.Save(laps); err != nil {
			return err
		}

		// gamePoints
		gamePoints := core.NewBaseCollection("gamePoints")
		gamePoints.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.BoolField{Name: "valid"},
			&core.TextField{Name: "time", Max: 64},
			&core.RelationField{Name: "pilot", CollectionId: pilots.Id, MaxSelect: 1},
			&core.RelationField{Name: "race", CollectionId: races.Id, MaxSelect: 1},
			&core.RelationField{Name: "channel", CollectionId: channels.Id, MaxSelect: 1},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
		)
		gamePoints.AddIndex("ux_gamePoints_source", true, "source, sourceId", "")
		gamePoints.ListRule = types.Pointer("")
		gamePoints.ViewRule = types.Pointer("")
		if err := app.Save(gamePoints); err != nil {
			return err
		}

		// results
		results := core.NewBaseCollection("results")
		results.Fields.Add(
			&core.TextField{Name: "sourceId", Required: true, Max: 64},
			&core.TextField{Name: "source", Max: 32},
			&core.NumberField{Name: "points"},
			&core.NumberField{Name: "position"},
			&core.BoolField{Name: "valid"},
			&core.BoolField{Name: "dnf"},
			&core.TextField{Name: "resultType", Max: 32},
			&core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
			&core.RelationField{Name: "race", CollectionId: races.Id, MaxSelect: 1},
			&core.RelationField{Name: "pilot", CollectionId: pilots.Id, MaxSelect: 1},
		)
		results.AddIndex("ux_results_source", true, "source, sourceId", "")
		results.ListRule = types.Pointer("")
		results.ViewRule = types.Pointer("")
		if err := app.Save(results); err != nil {
			return err
		}

		return nil
	}, func(app core.App) error {
		// delete collections in reverse dependency order
		for _, name := range []string{
			"results",
			"gamePoints",
			"laps",
			"detections",
			"pilotChannels",
			"races",
			"tracks",
			"channels",
			"pilots",
			"rounds",
			"events",
		} {
			if col, _ := app.FindCollectionByNameOrId(name); col != nil {
				if err := app.Delete(col); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
