// backend/internal/notify/notify.go
package notify

import (
	"context"

	"hooker/internal/domain"
)

// Decision is the result of a user interaction with a permission dialog.
// Action is "approve", "block", or "" (empty = fall through to terminal).
type Decision struct {
	Action string
	Reason string // populated when Action == "block"
}

// Notifier shows a native OS dialog for PermissionRequest events.
type Notifier interface {
	ShowPermissionDialog(ctx context.Context, e domain.NormalizedEvent) (Decision, error)
}
