"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import {
  HOSTS,
  SKILL_TARGETS,
  type PlatformOS,
  bridgeSnippet,
  hostPath,
  resolveHost,
  skillTargetPaths,
} from "../../lib/hosts";
import type { Listing } from "../../lib/telemetry";
import type { AgentChoice } from "../../lib/landing";
import { CopyButton } from "./CopyButton";
import { usePlatformOs } from "./usePlatformOs";

function preferredBridgeHost(agent: AgentChoice | null): string {
  const selected = agent && agent.id !== "other" ? resolveHost(agent.id) : undefined;
  return selected && selected.shape !== "" ? selected.id : "";
}

function preferredSkillTarget(agent: AgentChoice | null): string {
  return agent && SKILL_TARGETS.some((target) => target.id === agent.id) ? agent.id : "";
}

function SkillDestination({
  label,
  path,
  note,
}: {
  label: string;
  path: string;
  note?: string;
}) {
  return (
    <div>
      <p className="t-mono text-[10px] text-ink-3">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <code className="t-mono min-w-0 flex-1 break-all border border-rule-2 bg-sunken px-2.5 py-2 text-[11px] text-ink-2">
          {path}
        </code>
        <CopyButton text={path} label={`Copy ${label.toLowerCase()} skills path`} message="Skills path copied" />
      </div>
      {note && <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">{note}</p>}
    </div>
  );
}

function SkillSetup({
  item,
  agent,
  targetId,
  onTargetChange,
  platformOs,
  onPlatformChange,
}: {
  item: Listing;
  agent: AgentChoice | null;
  targetId: string;
  onTargetChange: (id: string) => void;
  platformOs: PlatformOS;
  onPlatformChange: (os: PlatformOS) => void;
}) {
  const target = SKILL_TARGETS.find((candidate) => candidate.id === targetId);
  const paths = target ? skillTargetPaths(target, platformOs) : undefined;
  const source = item.skillSource ?? item.publisher?.url;
  const sourceHref = source && /^https?:\/\//i.test(source) ? source : undefined;

  return (
    <div className="pb-2">
      <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
        Skills are folders containing <code className="t-mono">SKILL.md</code>, not MCP config entries.
        To place one by hand, copy its published folder into the selected user or project skills folder.
      </p>

      <label className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-ink-2">
        Agent destination
        <select
          aria-label="Agent destination"
          value={target?.id ?? ""}
          onChange={(event) => onTargetChange(event.target.value)}
          className="field max-w-full"
        >
          <option value="">Choose an agent…</option>
          {SKILL_TARGETS.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.displayName}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-ink-2">Show paths for</span>
        <div className="flex items-center gap-1.5 border border-ink-3 bg-sunken p-0.5">
          {(["win", "mac", "linux"] as PlatformOS[]).map((os) => (
            <button
              key={os}
              type="button"
              aria-pressed={platformOs === os}
              onClick={() => onPlatformChange(os)}
              className={`min-h-[36px] rounded-[3px] px-2.5 text-[11px] font-medium transition-colors ${
                platformOs === os ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"
              }`}
            >
              {os === "win" ? "Windows" : os === "mac" ? "macOS" : "Linux"}
            </button>
          ))}
        </div>
      </div>

      {target && paths ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {paths.userPath ? (
              <SkillDestination
                label="User-scope folder"
                path={paths.userPath}
                note={paths.userPathOverride
                  ? `${paths.note ?? `${paths.userPathOverride} is used when set.`} Default shown.`
                  : paths.note}
              />
            ) : (
              <div className="border border-rule bg-sunken px-3 py-3">
                <p className="t-mono text-[10px] text-ink-3">User scope</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                  This target has no documented global skills folder. Use the project folder below.
                </p>
              </div>
            )}
            <SkillDestination
              label="Project-scope folder"
              path={paths.projectPath}
              note="Relative to the project root."
            />
          </div>

          {sourceHref && (
            <p className="mt-3 text-[12px] leading-relaxed text-ink-2">
              <a href={sourceHref} target="_blank" rel="noopener noreferrer" className="link">
                Open {item.name} at its published source
              </a>
            </p>
          )}

          <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {agent && agent.id === target.id ? `${agent.label} is selected above. ` : ""}
              For an install LiteSPM can track, use the command above: it previews the destination and records
              the files so you can update, remove or restore them later.
            </span>
          </p>
        </>
      ) : (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">Choose an agent to see its user and project skills folders.</p>
      )}
    </div>
  );
}

function BridgeSetup({
  agent,
  activeHost,
  onHostChange,
  platformOs,
  onPlatformChange,
}: {
  agent: AgentChoice | null;
  activeHost: string;
  onHostChange: (id: string) => void;
  platformOs: PlatformOS;
  onPlatformChange: (os: PlatformOS) => void;
}) {
  const host = HOSTS.find((candidate) => candidate.id === activeHost);
  const snippet = host ? bridgeSnippet(host, "litespm", platformOs) : "";
  const selected = agent && agent.id !== "other" ? resolveHost(agent.id) : undefined;

  return (
    <div className="pb-2">
      <p className="max-w-prose text-[13px] leading-relaxed text-ink-2">
        This adds LiteSPM&rsquo;s bridge connection to an agent config file. It is separate from installing
        the capability shown on this page.
      </p>

      <div className="section-head mt-5">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">Bridge config</h3>
          <p className="section-note mt-0.5">One LiteSPM entry for this agent.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 border border-ink-3 bg-sunken p-0.5">
          {(["win", "mac", "linux"] as PlatformOS[]).map((os) => (
            <button
              key={os}
              type="button"
              aria-pressed={platformOs === os}
              onClick={() => onPlatformChange(os)}
              className={`min-h-[44px] rounded-[3px] px-2.5 text-[11px] font-medium transition-colors md:min-h-6 ${
                platformOs === os ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"
              }`}
            >
              {os === "win" ? "Windows" : os === "mac" ? "macOS" : "Linux"}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-[12px] text-ink-2">
        Agent host
        <select
          aria-label="Agent host"
          value={host?.id ?? ""}
          onChange={(event) => onHostChange(event.target.value)}
          className="field max-w-full"
        >
          <option value="">Choose an agent…</option>
          {HOSTS.filter((candidate) => candidate.shape !== "").map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </label>

      {host ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="t-mono text-[10px] text-ink-3">{host.kind === "extension" ? "Extension file" : "Config file"}</p>
          <div className="mt-1 flex items-start gap-2">
            <code className="t-mono min-w-0 flex-1 break-all border border-rule-2 bg-sunken px-2.5 py-2 text-[11px] text-ink-2">
              {hostPath(host, platformOs)}
            </code>
            <CopyButton text={hostPath(host, platformOs)} label="Copy configuration file path" message="Config path copied" />
          </div>
        </div>

        <div>
          <p className="t-mono text-[10px] text-ink-3">Config format</p>
          <p className="t-mono mt-1 border border-rule-2 bg-sunken px-2.5 py-2 text-[11px] uppercase text-ink-2">
            {host.kind}
          </p>
        </div>
          </div>

          <div className="mt-4">
            <h4 className="text-[13px] font-semibold text-ink">
              {host.kind === "extension" ? "Install the integration" : "Config entry"}
              <span className="ml-2 font-normal text-ink-3">{host.kind === "extension" ? "interactive capability browser" : "LiteSPM bridge"}</span>
            </h4>
            <div className="on-dark mt-2 overflow-hidden rounded-panel bg-dark">
              <div className="flex items-center justify-between gap-2 border-b border-dark-rule px-3 py-2">
                <span className="t-mono truncate text-[11px] text-dark-ink-2">
                  {host.kind === "extension" ? "LiteSPM setup command" : `${host.name} · ${host.kind === "toml" ? "config.toml" : "JSON config"}`}
                </span>
                <CopyButton text={snippet} label="Copy configuration snippet" message="Snippet copied" />
              </div>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3.5 font-mono text-[12px] leading-relaxed text-dark-ink">
                {snippet}
              </pre>
            </div>
          </div>

          <p className="mt-2.5 flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {selected?.id === host.id ? `${selected.name} is selected above. ` : ""}
              Running <code className="t-mono text-ink-2">litespm host setup {host.id}</code>{" "}
              {host.kind === "extension"
                ? "installs the extension and enables /marketplace."
                : <>backs up the config and adds this entry. <code className="t-mono text-ink-2">litespm restore</code> restores the saved file.</>}
            </span>
          </p>
        </>
      ) : (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Choose an MCP-capable agent to see its config path and bridge entry. Pi Agent uses its extension for skills and does not accept MCP server entries.
        </p>
      )}
    </div>
  );
}

export function ManualSetup({ item, agent }: { item: Listing; agent: AgentChoice | null }) {
  const skill = item.kind === "skill";
  const detectedOs = usePlatformOs();
  const [pickedOs, setPickedOs] = useState<PlatformOS | null>(null);
  const [activeHost, setActiveHost] = useState(() => preferredBridgeHost(agent));
  const [activeSkillTarget, setActiveSkillTarget] = useState(() => preferredSkillTarget(agent));
  const platformOs = pickedOs ?? detectedOs;
  const nextHost = preferredBridgeHost(agent);
  const nextSkillTarget = preferredSkillTarget(agent);

  useEffect(() => {
    setActiveHost(nextHost);
    setActiveSkillTarget(nextSkillTarget);
  }, [nextHost, nextSkillTarget]);

  return (
    <details className="group mt-4 border-t border-rule">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-medium text-ink-2 transition-colors duration-state ease-out hover:text-ink md:min-h-[40px]">
        {skill ? "Manual skill setup" : "Manual bridge setup"}
        <span className="flex items-center gap-2 text-[12px] font-normal text-ink-3">
          {skill ? "view destination folders" : "add the bridge entry"}
          <ChevronDown
            className="h-3.5 w-3.5 transition-transform duration-panel ease-out group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>

      {skill ? (
        <SkillSetup
          item={item}
          agent={agent}
          targetId={activeSkillTarget}
          onTargetChange={setActiveSkillTarget}
          platformOs={platformOs}
          onPlatformChange={setPickedOs}
        />
      ) : (
        <BridgeSetup
          agent={agent}
          activeHost={activeHost}
          onHostChange={setActiveHost}
          platformOs={platformOs}
          onPlatformChange={setPickedOs}
        />
      )}
    </details>
  );
}
