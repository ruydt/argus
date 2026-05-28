package handler

import (
	"encoding/json"
	"net/http"

	"hooker/internal/domain"
	"hooker/internal/service"
)

func Diagnostics(svc *service.EventService, ready func() bool, dbPath string, hookConfigs ...[]domain.DiagnosticsHookConfig) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		diagnostics, err := svc.Diagnostics(dbPath, ready(), hookConfigSlice(hookConfigs))
		if err != nil {
			http.Error(w, "diagnostics", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(diagnostics)
	})
}

func hookConfigSlice(hookConfigs [][]domain.DiagnosticsHookConfig) []domain.DiagnosticsHookConfig {
	if len(hookConfigs) == 0 {
		return nil
	}
	return hookConfigs[0]
}
