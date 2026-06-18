package handler

import "testing"

func TestRuntimeMappingRoundTrip(t *testing.T) {
	cases := map[string]string{"x.js": "node", "x.py": "python3", "x.sh": "sh", "x.txt": "sh", "noext": "sh"}
	for name, wantRuntime := range cases {
		if got := runtimeFromExt(name); got != wantRuntime {
			t.Errorf("runtimeFromExt(%q) = %q, want %q", name, got, wantRuntime)
		}
	}
	extCases := map[string]string{"node": ".js", "python3": ".py", "sh": ".sh", "weird": ".sh"}
	for rt, wantExt := range extCases {
		if got := runtimeExt(rt); got != wantExt {
			t.Errorf("runtimeExt(%q) = %q, want %q", rt, got, wantExt)
		}
	}
}
