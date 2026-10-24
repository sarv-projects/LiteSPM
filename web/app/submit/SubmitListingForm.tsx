"use client";

import { useState } from "react";
import { ArrowRight, Blocks, Cable, Sparkles } from "lucide-react";
import { REPO_URL } from "../../lib/site";

const TYPES = [
  { value: "MCP server", label: "MCP server", icon: Cable },
  { value: "Agent skill", label: "Agent skill", icon: Sparkles },
  { value: "Plugin", label: "Plugin", icon: Blocks },
] as const;

export function SubmitListingForm() {
  const [name, setName] = useState("");

  return (
    <form
      className="submit-form"
      action={REPO_URL + "/issues/new"}
      method="get"
      target="_blank"
      rel="noopener noreferrer"
      aria-labelledby="submit-form-title"
    >
      <input type="hidden" name="template" value="new-listing.yml" />
      <input
        type="hidden"
        name="title"
        value={name.trim() ? "[Listing] " + name.trim() : "[Listing] New capability"}
      />

      <div className="submit-form-heading">
        <div>
          <p className="kicker">Start a listing</p>
          <h2 id="submit-form-title">Tell us about the project</h2>
        </div>
        <span className="submit-form-time">2–3 min</span>
      </div>

      <fieldset className="submit-kind-fieldset">
        <legend>What are you submitting?</legend>
        <div className="submit-kind-options">
          {TYPES.map(({ value, label, icon: Icon }, index) => (
            <label key={value} className="submit-kind-option">
              <input
                type="radio"
                name="listing-type"
                value={value}
                defaultChecked={index === 0}
                required
              />
              <span className="submit-kind-icon"><Icon aria-hidden="true" /></span>
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="submit-form-grid">
        <label className="submit-field">
          <span>Project name <span aria-hidden="true">*</span></span>
          <input
            name="listing-name"
            type="text"
            placeholder="e.g. Context7"
            autoComplete="off"
            minLength={2}
            maxLength={120}
            required
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <label className="submit-field">
          <span>Project or publisher URL <span aria-hidden="true">*</span></span>
          <input
            name="source-url"
            type="url"
            placeholder="https://github.com/owner/project"
            autoComplete="url"
            maxLength={500}
            required
          />
        </label>
      </div>

      <label className="submit-field">
        <span>What does it help an agent do? <span aria-hidden="true">*</span></span>
        <textarea
          name="listing-summary"
          placeholder="Describe the job it does in plain language."
          minLength={20}
          maxLength={280}
          rows={2}
          required
        />
        <span className="submit-field-hint">A short description people can understand at a glance.</span>
      </label>

      <label className="submit-field">
        <span>Setup or install details <span aria-hidden="true">*</span></span>
        <textarea
          name="install-verification-details"
          placeholder="Share the install command or endpoint, required setup, and any files to include."
          minLength={20}
          maxLength={1200}
          rows={4}
          required
        />
      </label>

      <div className="submit-form-grid">
        <label className="submit-field">
          <span>Version or pinned revision</span>
          <input
            name="version-or-revision"
            type="text"
            placeholder="e.g. v1.2.3 or a commit hash"
            maxLength={120}
          />
        </label>
        <label className="submit-field">
          <span>Known agent hosts or requirements</span>
          <input
            name="compatibility"
            type="text"
            placeholder="e.g. Codex, Claude Code; Node.js 22+"
            maxLength={360}
          />
        </label>
      </div>

      <label className="submit-field">
        <span>Anything else to help the review?</span>
        <textarea
          name="additional-context"
          placeholder="Optional documentation or publisher notes."
          rows={2}
          maxLength={400}
        />
      </label>

      <div className="submit-form-footer">
        <p>Review your request on GitHub before you send it. Your details are carried into the form.</p>
        <button className="btn btn-solid btn-lg submit-form-button" type="submit">
          Continue to GitHub <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
