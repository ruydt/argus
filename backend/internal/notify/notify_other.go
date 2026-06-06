// backend/internal/notify/notify_other.go
//go:build !darwin

package notify

import (
	"context"

	"hooker/internal/domain"
)

type noopNotifier struct{}

func (noopNotifier) ShowPermissionDialog(_ context.Context, _ domain.NormalizedEvent) (Decision, error) {
	return Decision{}, nil
}

// NewPlatformNotifier returns a no-op notifier on non-darwin platforms.
func NewPlatformNotifier() Notifier {
	return noopNotifier{}
}
