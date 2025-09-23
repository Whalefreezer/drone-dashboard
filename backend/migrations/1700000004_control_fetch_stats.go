package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		col := core.NewBaseCollection("control_stats")
		col.Fields.Add(
			&core.TextField{Name: "bucket", Required: true, Max: 64, Presentable: true},
			&core.NumberField{Name: "total"},
			&core.NumberField{Name: "fullResponses"},
			&core.NumberField{Name: "etagHits"},
			&core.NumberField{Name: "errors"},
		)
		col.AddIndex("ux_control_stats_bucket", true, "bucket", "")
		col.ListRule = types.Pointer("")
		col.ViewRule = types.Pointer("")
		if err := app.Save(col); err != nil {
			return err
		}
		return nil
	}, func(app core.App) error {
		_ = app.DeleteTable("control_stats")
		return nil
	})
}
