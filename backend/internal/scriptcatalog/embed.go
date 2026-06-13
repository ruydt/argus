package scriptcatalog

import "embed"

// bundledFS holds the synced hook-script collection + manifest.
// Populated by `make sync-scripts` from the repo-root my-custom-hook-scripts/.
//
//go:embed files/*.js files/catalog.json
var bundledFS embed.FS
