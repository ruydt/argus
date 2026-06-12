package service_test

import (
	"testing"

	"argus/internal/domain"
	"argus/internal/service"
)

func BenchmarkBroadcastFiveSubscribers(b *testing.B) {
	svc := service.New(stubAddRepo{})
	for i := 0; i < 5; i++ {
		ch := svc.Subscribe()
		go func() {
			for ev := range ch {
				_ = ev
			}
		}()
		defer svc.Unsubscribe(ch)
	}
	e := domain.NormalizedEvent{Time: "2026-06-13T00:00:00Z", Agent: "claudecode", Session: "bench"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := svc.AddEvent(e); err != nil {
			b.Fatal(err)
		}
	}
}
