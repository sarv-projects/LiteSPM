import React from "react";
import { ArrowRight, CheckCircle2, Monitor, Package, Search } from "lucide-react";

const FLOW = [
  { title: "Discover", detail: "Explore MCP servers, skills, and plugins by task or agent." },
  { title: "Check compatibility", detail: "Review the source and supported installation options." },
  { title: "Connect your agent", detail: "Run LiteSPM locally and choose the agent you use." },
  { title: "Install", detail: "Copy the exact command from the marketplace listing." },
  { title: "Manage", detail: "Review, remove, or restore LiteSPM-managed changes." },
] as const;

/**
 * An editorial workflow overview, not a mock terminal or an unpublished video.
 * The interface contains only real product actions and avoids inventing output.
 */
export function ProductDemo() {
  return (
    <section id="product-demo" aria-labelledby="product-demo-title" className="overflow-hidden rounded-card border border-rule bg-surface">
      <div id="product-demo-poster" className="relative overflow-hidden border-b border-rule bg-sunken p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <span className="t-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink-3">
            Installation workflow
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
            Local control
          </span>
        </div>
        <div className="mt-5 rounded-panel border border-rule-2 bg-surface px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-accent-wash">
              <Package className="h-5 w-5 text-accent-text" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold text-ink">Your agent, your capabilities</p>
              <p className="mt-0.5 text-[12px] text-ink-3">Marketplace discovery · Local installation</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 items-center gap-2 text-center">
            <div className="rounded-lg border border-rule bg-sunken px-2 py-3">
              <Search className="mx-auto h-5 w-5 text-ink-2" aria-hidden="true" />
              <p className="mt-2 text-[11px] font-medium text-ink-2">Find</p>
            </div>
            <div className="rounded-lg border border-rule bg-sunken px-2 py-3">
              <Monitor className="mx-auto h-5 w-5 text-ink-2" aria-hidden="true" />
              <p className="mt-2 text-[11px] font-medium text-ink-2">Install</p>
            </div>
            <div className="rounded-lg border border-rule bg-sunken px-2 py-3">
              <CheckCircle2 className="mx-auto h-5 w-5 text-ink-2" aria-hidden="true" />
              <p className="mt-2 text-[11px] font-medium text-ink-2">Manage</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="product-demo-title" className="text-[16px] font-semibold tracking-tight text-ink">
            From discovery to installation
          </h2>
          <span className="t-mono text-[11px] text-ink-3">Five simple stages</span>
        </div>
        <ol id="product-demo-captions" className="mt-4 space-y-3">
          {FLOW.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="t-mono mt-0.5 w-5 shrink-0 text-[11px] tabular-nums text-ink-3">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{step.title}</p>
                <p className="text-[12.5px] leading-relaxed text-ink-2">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <details id="product-demo-transcript" className="mt-4 border-t border-rule pt-3">
          <summary className="cursor-pointer text-[12.5px] font-medium text-ink-2">
            What happens on your computer <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />
          </summary>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            LiteSPM runs locally. After the initial agent setup and catalog sync, the CLI installs
            supported capabilities, records managed changes, and provides commands for removal
            and restoration. Installation behavior and compatibility depend on the package type.
          </p>
        </details>
      </div>
    </section>
  );
}
