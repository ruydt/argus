package service_test

import (
	"encoding/json"
	"testing"

	"argus/internal/domain"
	"argus/internal/repository"
	"argus/internal/service"
)

// stubAddRepo satisfies EventRepository via interface embedding; only the
// methods AddEvent touches are implemented.
type stubAddRepo struct {
	repository.EventRepository
}

func (stubAddRepo) Add(domain.NormalizedEvent) error { return nil }
func (stubAddRepo) UpsertSession(string, string, string, string, string, string, string, string, domain.SessionUsage) error {
	return nil
}

func TestBroadcastMarshalsOnce(t *testing.T) {
	svc := service.New(stubAddRepo{})
	ch1 := svc.Subscribe()
	ch2 := svc.Subscribe()
	defer svc.Unsubscribe(ch1)
	defer svc.Unsubscribe(ch2)

	e := domain.NormalizedEvent{Time: "2026-06-13T00:00:00Z", Agent: "claudecode", Session: "s1"}
	if err := svc.AddEvent(e); err != nil {
		t.Fatal(err)
	}

	got1 := <-ch1
	got2 := <-ch2
	if got1.Session != "s1" || got2.Session != "s1" {
		t.Fatalf("session field: got %q / %q", got1.Session, got2.Session)
	}
	if string(got1.Payload) != string(got2.Payload) {
		t.Fatal("subscribers received different payloads")
	}
	var decoded domain.NormalizedEvent
	if err := json.Unmarshal(got1.Payload, &decoded); err != nil {
		t.Fatalf("payload not valid event JSON: %v", err)
	}
	if decoded.Session != "s1" {
		t.Fatalf("decoded session = %q", decoded.Session)
	}
}
