package main

import "testing"

func TestFloatingSkillWarning(t *testing.T) {
	tests := []struct {
		pin     string
		warning bool
	}{
		{"main", true},
		{"master", true},
		{"HEAD", true},
		{"v1.2.3", true},
		{"0123456789abcdef0123456789abcdef01234567", false},
		{"", true},
	}
	for _, tc := range tests {
		got := floatingSkillWarning(tc.pin)
		if (got != "") != tc.warning {
			t.Errorf("pin %q: warning %q, want warning=%t", tc.pin, got, tc.warning)
		}
	}
}
