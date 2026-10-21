package domain

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

var (
	// RegexSourceID validates <namespace>:<slug>
	// e.g. builtin:mcp-registry, git:anthropic-official
	RegexSourceID = regexp.MustCompile(`^[a-z0-9_-]{3,32}:[a-z0-9_-]{3,64}$`)

	// RegexListingID validates <kind>:<source-id>:<percent-encoded-upstream-id>
	// e.g. mcp:builtin:mcp-registry:%40modelcontextprotocol%2Fpg
	RegexListingID = regexp.MustCompile(`^(plugin|mcp|skill|connector|agent|rule|hook|tool|lsp):[a-z0-9_:-]+:[A-Za-z0-9_.~%+-]+$`)

	// RegexInstallID validates inst_<26-char-ULID-or-UUIDv7-or-scoped-id>
	// e.g. inst_01J9X8K2M4N5P6Q7R8S9T0U1V2 or inst_user_sqlite_a1b2c3d4
	RegexInstallID = regexp.MustCompile(`^inst_[0-9A-Za-z_-]{10,64}$`)

	// RegexReleaseID validates a catalog release id such as rel-2026-10-05-01.
	// The id is used verbatim inside remote URL segments and on-disk cache
	// paths, so the character class excludes every path separator and forbids
	// a leading dot: no release id can name ".", "..", or escape its directory.
	RegexReleaseID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

	// RegexDigest validates sha256:<hex>
	RegexDigest = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)
)

// ValidateReleaseID rejects a release id that is unsafe to place in a URL
// segment or filesystem path. Both the release builder and the catalog client
// call it, so a malformed id fails at the boundary instead of at the path.
func ValidateReleaseID(raw string) error {
	if !RegexReleaseID.MatchString(raw) {
		return ErrInvalidIdentifier(raw, "<release-id>: [A-Za-z0-9][A-Za-z0-9._-]{0,63} (no slashes, no leading dot)")
	}
	return nil
}

// SourceID represents an immutable upstream catalog or feed identifier (<namespace>:<slug>)
type SourceID string

// String returns the string representation of SourceID.
func (s SourceID) String() string {
	return string(s)
}

// ParseSourceID validates and constructs a canonical SourceID.
func ParseSourceID(raw string) (SourceID, error) {
	if !RegexSourceID.MatchString(raw) {
		return "", ErrInvalidIdentifier(raw, "<namespace>:<slug> (^[a-z0-9_-]{3,32}:[a-z0-9_-]{3,64}$)")
	}
	return SourceID(raw), nil
}

// Namespace returns the namespace component of SourceID.
func (s SourceID) Namespace() string {
	parts := strings.SplitN(string(s), ":", 2)
	if len(parts) > 0 {
		return parts[0]
	}
	return ""
}

// Slug returns the slug component of SourceID.
func (s SourceID) Slug() string {
	parts := strings.SplitN(string(s), ":", 2)
	if len(parts) > 1 {
		return parts[1]
	}
	return ""
}

// ListingID represents a canonical listing identifier in the LiteSPM catalog.
// Format: <kind>:<source-id>:<percent-encoded-upstream-id>
type ListingID string

// String returns the string representation of ListingID.
func (l ListingID) String() string {
	return string(l)
}

// ParseListingID parses and validates a ListingID string.
func ParseListingID(raw string) (ListingID, error) {
	if !RegexListingID.MatchString(raw) {
		return "", ErrInvalidIdentifier(raw, "<kind>:<source-id>:<percent-encoded-upstream-id>")
	}
	return ListingID(raw), nil
}

// NewListingID formats a canonical ListingID from parts.
func NewListingID(kind ListingKind, sourceID SourceID, upstreamID string) ListingID {
	// QueryEscape escapes everything the id grammar forbids ("@" and "/"
	// among them), but it writes a space as "+" — and the grammar allows "+"
	// literally, so a space and a plus would collide. Rewriting the "+" to
	// "%20" makes the two distinguishable, and the result is decoded with
	// PathUnescape, which is what the catalog reader uses.
	encodedUpstream := strings.ReplaceAll(url.QueryEscape(upstreamID), "+", "%20")
	return ListingID(fmt.Sprintf("%s:%s:%s", kind, sourceID, encodedUpstream))
}

// Kind extracts the ListingKind.
func (l ListingID) Kind() ListingKind {
	parts := strings.SplitN(string(l), ":", 2)
	if len(parts) > 0 {
		return ListingKind(parts[0])
	}
	return ""
}

// splitListingID splits a listing id into its three parts.
//
// The grammar is <kind>:<source>:<encoded-upstream-id>, and BOTH the source
// segment and the upstream segment can contain a colon:
//
//	<kind>          no colon
//	<source>        colons allowed (a source is <namespace>:<slug>)
//	<upstream>      percent-encoded, so a colon appears as %3A
//
// The upstream segment is therefore the part after the LAST colon and the
// source is everything between the first and the last. Splitting on every
// colon and demanding four parts read only the four-part form, so the
// three-part ids the catalog actually publishes — every skill row
// (skill:anthropics:pdf), every plugin row (plugin:anthropics:skills) and
// 4,335 mcp rows — parsed and then decomposed into nothing.
//
// A colon in the upstream id is percent-encoded by NewListingID, so it can
// never appear literally; the split below is therefore unambiguous.
func splitListingID(raw string) (kind, source, encodedUpstream string, ok bool) {
	first := strings.Index(raw, ":")
	if first <= 0 {
		return "", "", "", false
	}
	last := strings.LastIndex(raw, ":")
	if last <= first || last == len(raw)-1 {
		return "", "", "", false
	}
	return raw[:first], raw[first+1 : last], raw[last+1:], true
}

// SourceID extracts the SourceID.
func (l ListingID) SourceID() SourceID {
	_, source, _, ok := splitListingID(string(l))
	if !ok {
		return ""
	}
	return SourceID(source)
}

// UpstreamID extracts and decodes the upstream ID.
func (l ListingID) UpstreamID() (string, error) {
	_, _, encoded, ok := splitListingID(string(l))
	if !ok {
		return "", ErrInvalidIdentifier(string(l), "ListingID requires <kind>:<source>:<encoded-upstream-id>")
	}
	decoded, err := url.PathUnescape(encoded)
	if err != nil {
		return "", fmt.Errorf("failed to unescape upstream id %q: %w", encoded, err)
	}
	return decoded, nil
}

// ComponentID represents a discrete runnable or readable sub-element within a package release.
// Format: <listing-id>@<resolved-version>#<kind>/<component-name>
// Example: mcp:builtin:mcp-registry:pg@1.4.0#mcp-provider/server
type ComponentID string

// String returns the string representation of ComponentID.
func (c ComponentID) String() string {
	return string(c)
}

// NewComponentID formats a canonical ComponentID.
func NewComponentID(listingID ListingID, version string, kind ComponentKind, componentName string) ComponentID {
	return ComponentID(fmt.Sprintf("%s@%s#%s/%s", listingID, version, kind, componentName))
}

// ParseComponentID parses and decomposes a ComponentID.
func ParseComponentID(raw string) (ComponentID, ListingID, string, ComponentKind, string, error) {
	atIdx := strings.Index(raw, "@")
	hashIdx := strings.Index(raw, "#")
	if atIdx == -1 || hashIdx == -1 || atIdx >= hashIdx {
		return "", "", "", "", "", ErrInvalidIdentifier(raw, "<listing-id>@<resolved-version>#<kind>/<component-name>")
	}

	rawListingID := raw[:atIdx]
	listingID, err := ParseListingID(rawListingID)
	if err != nil {
		return "", "", "", "", "", err
	}

	version := raw[atIdx+1 : hashIdx]
	if version == "" {
		return "", "", "", "", "", ErrInvalidIdentifier(raw, "version segment cannot be empty")
	}

	kindAndName := raw[hashIdx+1:]
	slashIdx := strings.Index(kindAndName, "/")
	if slashIdx == -1 {
		return "", "", "", "", "", ErrInvalidIdentifier(raw, "expected <kind>/<component-name> after '#'")
	}

	kind := ComponentKind(kindAndName[:slashIdx])
	componentName := kindAndName[slashIdx+1:]
	if componentName == "" {
		return "", "", "", "", "", ErrInvalidIdentifier(raw, "component name cannot be empty")
	}

	return ComponentID(raw), listingID, version, kind, componentName, nil
}

// InstallID represents a locally installed instance (e.g. inst_01J9X8K2M4N5P6Q7R8S9T0U1V2).
type InstallID string

// String returns the string representation of InstallID.
func (i InstallID) String() string {
	return string(i)
}

// ParseInstallID validates and constructs an InstallID.
func ParseInstallID(raw string) (InstallID, error) {
	if !RegexInstallID.MatchString(raw) {
		return "", ErrInvalidIdentifier(raw, "inst_<26-char-ULID-or-UUIDv7>")
	}
	return InstallID(raw), nil
}

// CapabilityID represents an exposed tool or action bound to an installed component.
// Format: <install-id>/<component-name>/<provider-native-tool-name>
// Example: inst_01J9X8K2M4N5P6/server/query_db
type CapabilityID string

// String returns the string representation of CapabilityID.
func (c CapabilityID) String() string {
	return string(c)
}

// NewCapabilityID formats a canonical CapabilityID.
func NewCapabilityID(installID InstallID, componentName, toolName string) CapabilityID {
	return CapabilityID(fmt.Sprintf("%s/%s/%s", installID, componentName, toolName))
}

// ParseCapabilityID decomposes a CapabilityID into installID, componentName, toolName.
func ParseCapabilityID(raw string) (CapabilityID, InstallID, string, string, error) {
	parts := strings.Split(raw, "/")
	if len(parts) < 3 {
		return "", "", "", "", ErrInvalidIdentifier(raw, "<install-id>/<component-name>/<provider-native-tool-name>")
	}
	installID, err := ParseInstallID(parts[0])
	if err != nil {
		return "", "", "", "", err
	}
	componentName := parts[1]
	toolName := strings.Join(parts[2:], "/")
	if componentName == "" || toolName == "" {
		return "", "", "", "", ErrInvalidIdentifier(raw, "component name and tool name cannot be empty")
	}
	return CapabilityID(raw), installID, componentName, toolName, nil
}
