# Schemas & Validation Examples

## 1. Canonical Schema Registry

All public contracts and local plans are validated against strict JSON Schema (Draft 2020-12) specifications located in `schemas/`:

1.  `schemas/listing.schema.json`: Catalog discovery listings.
2.  `schemas/version.schema.json`: Pinned version and artifact references.
3.  `schemas/source.schema.json`: Upstream registry and marketplace configurations.
4.  `schemas/install-plan.schema.json`: Cryptographic plan contracts.
5.  `schemas/catalog-release.schema.json`: Release pointers and file manifests.
6.  `schemas/errors.schema.json`: Machine-readable error envelopes.

### 1.1 The validator (`internal/schemacheck`)

The six schemas are not decorative. `internal/schemacheck` is a dependency-free JSON Schema
(Draft 2020-12) validator that parses them and validates the *artifacts the code actually emits*
against them. `internal/schemacheck/schema.go` implements exactly the keyword subset these files
use — `type`, `required`, `properties`, `additionalProperties`, `items`, `enum`, `const`, `pattern`,
`minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `uniqueItems`, `oneOf`,
`anyOf`, `allOf` — plus the annotation keywords (`$schema`, `$id`, `title`, `description`, `default`,
`format`, `examples`, `$comment`, `deprecated`), which are parsed and ignored exactly as draft
2020-12 defines (`format` is an annotation and is not enforced). Any keyword outside that set is
**rejected at Parse time**: a validator that silently ignored a constraint the author wrote would
hide the very drift it exists to catch.

`internal/schemacheck/contracts_test.go` is where drift becomes a test failure. It validates the
committed release tree under `web/public/v1/releases/` (`TestCommittedReleaseTreeValidates`), a
fresh `CompileRelease` output (`TestCompiledReleaseValidates`), a real snapshot record
(`TestSnapshotRecordValidates`), an `LPSMError` envelope (`TestErrorEnvelopeValidates`) and a
marshalled `domain.InstallPlan` (`TestInstallPlanValidates`); it pins the schemas that duplicate a
domain identifier grammar to `domain.Regex*` (`TestSchemaPatternsMatchDomainIdentifiers`) and
reproduces the pre-fix failure, where each old subschema rejected the real artifact it was supposed
to describe (`TestPreFixSchemasRejectRealArtifacts`).

**The schemas mirror the emitted artifacts, not a target.** Where a schema and the Go producer
disagreed, the schema was corrected to the artifact the code writes — this session that was
`catalog-release`, `source`, `listing`, `version` and `install-plan`; `errors` was already
consistent.

---

## 2. Specification: `install-plan.schema.json`

> Implementation note (ID honesty). Plan IDs are now real, not placeholders: `newPlanID()` (`cmd/litespm/main.go`) emits `plan_` followed by 26 Crockford base32 symbols drawn from `crypto/rand`, matching the schema pattern `^plan_[0-9A-Za-z]{26}$` below. Install IDs are deterministic, not random: `internal/install/engine.go:Execute` emits `inst_<scope>_<safeListing>_<digest8>` (scope `user`/`project`; `digest8` = first 8 hex chars of the tree SHA-256). **No JSON Schema declares an install-ID pattern**; the real validation is the Go regex `RegexInstallID = ^inst_[0-9A-Za-z_-]{10,64}$` in `internal/domain/identifiers.go`. The earlier `^inst_[0-9A-Za-z_-]{20,36}$` reference was a phantom that never appeared in `schemas/` or code, and has been removed. Persisted `plans`/`installs` rows should still be validated strictly against the patterns that actually exist.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://litespm.dev/schemas/v1/install-plan.schema.json",
  "title": "InstallPlan",
  "type": "object",
  "required": [
    "schemaVersion", "planId", "planHash", "createdAt", "expiresAt",
    "catalogReleaseId", "request", "resolved", "effects", "preconditions", "approval"
  ],
  "properties": {
    "schemaVersion": { "type": "integer", "const": 2 },
    "planId": { "type": "string", "pattern": "^plan_[0-9A-Za-z]{26}$" },
    "planHash": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
    "createdAt": { "type": "string", "format": "date-time" },
    "expiresAt": { "type": "string", "format": "date-time" },
    "catalogReleaseId": { "type": "string" },
    "sourceSnapshots": { "type": "array", "items": { "type": "string" } },
    "request": {
      "type": "object",
      "required": ["listingId", "targetScope"],
      "properties": {
        "listingId": { "type": "string" },
        "requestedVersion": { "type": "string" },
        "selectedComponents": { "type": "array", "items": { "type": "string" } },
        "targetScope": { "type": "string", "enum": ["user", "project"] },
        "targetHost": { "type": "string" },
        "workspaceId": { "type": "string" },
        "projectRoot": { "type": "string" }
      },
      "additionalProperties": false
    },
    "resolved": {
      "type": "object",
      "required": ["version", "artifacts"],
      "properties": {
        "version": { "type": "string" },
        "immutableRefs": { "type": "array", "items": { "type": "string" } },
        "artifacts": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["artifactId", "type", "locator"],
            "properties": {
              "artifactId": { "type": "string" },
              "type": { "type": "string" },
              "locator": { "type": "string" },
              "digest": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
              "size": { "type": "integer" }
            },
            "additionalProperties": false
          }
        },
        "dependencies": { "type": "array", "items": { "type": "string" } },
        "runtimeRequirements": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["type", "name"],
            "properties": {
              "type": { "type": "string" },
              "name": { "type": "string" },
              "version": { "type": "string" }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "effects": { "type": "array", "items": { "type": "string" } },
    "preconditions": {
      "type": "object",
      "properties": {
        "filesystemPaths": { "type": "array", "items": { "type": "string" } },
        "portsAvailable": { "type": "array", "items": { "type": "integer" } },
        "runtimesFound": { "type": "array", "items": { "type": "string" } },
        "diskSpaceBytes": { "type": "integer" }
      },
      "additionalProperties": false
    },
    "approval": {
      "type": "object",
      "required": ["channel", "decision"],
      "properties": {
        "approvalId": { "type": "string" },
        "channel": { "type": "string" },
        "decision": { "type": "string" },
        "decidedAt": { "type": "string", "format": "date-time" },
        "approvedBy": { "type": "string" }
      },
      "additionalProperties": false
    },
    "hostChanges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["hostId", "configPath", "action", "entryKey"],
        "properties": {
          "hostId": { "type": "string" },
          "configPath": { "type": "string" },
          "action": { "type": "string" },
          "entryKey": { "type": "string" },
          "valueJson": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "providerLaunches": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["providerId", "transport"],
        "properties": {
          "providerId": { "type": "string" },
          "transport": { "type": "string" },
          "command": { "type": "string" },
          "args": { "type": "array", "items": { "type": "string" } },
          "env": { "type": "object", "additionalProperties": { "type": "string" } },
          "endpoint": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "requestedAccess": {
      "type": "object",
      "properties": {
        "tools": { "type": "array", "items": { "type": "string" } },
        "paths": { "type": "array", "items": { "type": "string" } },
        "hosts": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

The excerpt above is the committed schema
([`schemas/install-plan.schema.json`](../schemas/install-plan.schema.json)); the authoritative text
is that file, and `internal/schemacheck` validates a marshalled `domain.InstallPlan` against it.

---

## 3. Concrete Example Fixtures

### 3.1 Valid Listing Fixture
```json
{
  "schemaVersion": 1,
  "id": "mcp:builtin:mcp-registry:postgres",
  "kind": "mcp",
  "name": "PostgreSQL MCP Server",
  "summary": "Read-only and read-write SQL access to PostgreSQL databases via MCP.",
  "categories": ["database", "developer-tools"],
  "keywords": ["postgres", "sql", "mcp"],
  "publisherClaim": {
    "name": "Model Context Protocol",
    "url": "https://github.com/modelcontextprotocol"
  },
  "source": {
    "sourceId": "builtin:mcp-registry",
    "upstreamId": "postgres",
    "sourceType": "mcp-registry",
    "manifestFormat": "server.json"
  },
  "versions": [
    {
      "version": "1.4.0",
      "immutableRef": "git:7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
      "publishedAt": "2026-09-20T10:00:00Z"
    }
  ],
  "componentsSummary": [
    { "kind": "mcp-provider", "name": "server", "supportedByLiteSPM": "yes" }
  ],
  "requirementsSummary": ["executable:node >= 18.0.0"],
  "compatibilitySummary": [
    { "host": "claude-code", "supported": "yes" },
    { "host": "codex", "supported": "yes" }
  ],
  "verificationSummary": {
    "sourceVerified": true,
    "formatCompatible": true,
    "tested": true,
    "lastTestedAt": "2026-09-30T10:00:00Z"
  },
  "provenance": {
    "firstSeenAt": "2026-09-01T00:00:00Z",
    "lastSeenAt": "2026-09-30T12:00:00Z",
    "fetchedAt": "2026-09-30T12:00:00Z"
  },
  "status": "active"
}
```
