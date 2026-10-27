import test from "node:test";
import assert from "node:assert/strict";
import { listingSummary } from "./listingSummary.mjs";

test("omits audited boilerplate summaries without changing catalog data", () => {
  for (const summary of [
    "Description of my MCP server",
    "Small public utility for autonomous clients.",
    ">",
  ]) {
    assert.equal(listingSummary({ kind: "mcp", summary }), "");
  }
});

test("turns skill trigger copy into a concise task description", () => {
  assert.equal(
    listingSummary({
      kind: "skill",
      summary: "Use this skill when the user wants to build a sample app. Triggers include requests like build an app or start a project.",
    }),
    "Use when you want to build a sample app."
  );
  assert.equal(
    listingSummary({
      kind: "skill",
      summary: "Use this skill whenever the user wants to create a deck. Triggers include: create slides or improve a presentation.",
    }),
    "Use when you want to create a deck."
  );
  assert.equal(
    listingSummary({ kind: "skill", summary: "Use when reviewing a Maven pom.xml file." }),
    "For reviewing a Maven pom.xml file."
  );
  assert.equal(
    listingSummary({ kind: "skill", summary: "Use this skill whenever the user is working with Drizzle ORM on PostgreSQL." }),
    "For working with Drizzle ORM on PostgreSQL."
  );
});

test("keeps useful publisher descriptions intact", () => {
  const summary = "Connect your project to GitHub issues and pull requests.";
  assert.equal(listingSummary({ kind: "mcp", summary }), summary);
});
