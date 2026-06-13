package service_test

import (
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/repository/sqlite"
	"argus/internal/service"
)

func TestGetDashboardStatsCached(t *testing.T) {
	repo, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = repo.Close() }()
	svc := service.New(repo)

	if err := svc.AddEvent(domain.NormalizedEvent{
		Time: "2026-06-13T00:00:00Z", Agent: "claudecode", Session: "s1",
		HookEventName: "PostToolUse", Action: "EDIT",
	}); err != nil {
		t.Fatal(err)
	}

	first, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatal(err)
	}
	if first.TotalEvents != 1 {
		t.Fatalf("TotalEvents = %d", first.TotalEvents)
	}

	// Second event lands, but within the TTL the cached snapshot is served.
	if err := svc.AddEvent(domain.NormalizedEvent{
		Time: "2026-06-13T00:00:01Z", Agent: "claudecode", Session: "s1",
		HookEventName: "PostToolUse", Action: "EDIT",
	}); err != nil {
		t.Fatal(err)
	}
	second, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatal(err)
	}
	if second.TotalEvents != 1 {
		t.Fatalf("expected cached TotalEvents=1, got %d", second.TotalEvents)
	}

	// Expire the cache; the fresh value is computed.
	svc.SetStatsCachedAt("|", time.Now().Add(-time.Minute))
	third, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatal(err)
	}
	if third.TotalEvents != 2 {
		t.Fatalf("expected fresh TotalEvents=2 after expiry, got %d", third.TotalEvents)
	}
}
