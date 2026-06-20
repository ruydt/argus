package service_test

import (
	"testing"

	"argus/internal/domain"
	"argus/internal/service"
)

// An agent the detector reports (i.e. one the user added on the Hooks page)
// appears as its own row on the Agent Connectivity board, with its label and
// hook-config status.
func TestDiagnosticsListsEnabledAgents(t *testing.T) {
	svc := service.New(&mockRepo{})

	got, err := svc.Diagnostics(":memory:", true, []domain.DiagnosticsHookConfig{
		{Agent: "claudecode", Label: "Claude Code", Status: "configured"},
		{Agent: "codex", Label: "Codex", Status: "missing"},
		{Agent: "cursor", Label: "Cursor", Status: "configured"},
	})
	if err != nil {
		t.Fatalf("Diagnostics: %v", err)
	}
	if len(got.Agents) != 3 {
		t.Fatalf("len(Agents) = %d, want 3: %+v", len(got.Agents), got.Agents)
	}
	cursor := got.Agents[2]
	if cursor.ID != "cursor" || cursor.Label != "Cursor" {
		t.Fatalf("third row = %+v, want cursor/Cursor", cursor)
	}
	if cursor.HookConfigStatus != "configured" {
		t.Fatalf("cursor hook status = %q, want configured", cursor.HookConfigStatus)
	}
	if cursor.Status != "no events" {
		t.Fatalf("cursor status = %q, want no events (no activity yet)", cursor.Status)
	}
}
