package host

import (
	"sort"
	"testing"
)

func TestPiAndGrokProductsKeepIndependentHostIdentities(t *testing.T) {
	want := []string{"grok", "grok-build", "pi", "pi-agent"}
	seen := make(map[string]bool)
	for _, id := range want {
		adapter, err := GetAdapter(id)
		if err != nil {
			t.Fatalf("GetAdapter(%q): %v", id, err)
		}
		got := adapter.Descriptor().HostID
		if got != id {
			t.Errorf("GetAdapter(%q) resolves to host %q; distinct products must retain their own identity", id, got)
		}
		if seen[got] {
			t.Errorf("host identity %q was collapsed", got)
		}
		seen[got] = true
	}

	list := ListAdapters()
	if len(list) != 52 {
		t.Errorf("registered host identities = %d, want 52 including separate pi/pi-agent and grok/grok-build", len(list))
	}
	ids := make([]string, 0, len(list))
	for _, adapter := range list {
		ids = append(ids, adapter.Descriptor().HostID)
	}
	if !sort.StringsAreSorted(ids) {
		t.Errorf("ListAdapters IDs are not deterministic and sorted: %v", ids)
	}
}
