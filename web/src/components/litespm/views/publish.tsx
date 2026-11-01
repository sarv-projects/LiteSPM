"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, GitBranch, Loader2, MessageSquare, Package, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/litespm/router";

const KINDS = [
  { id: "publisher", label: "I publish a package — get it listed / fix its record" },
  { id: "listing-correction", label: "A listing's data is wrong" },
  { id: "general", label: "General feedback about this site" },
];

const STANDARDS = [
  {
    icon: Package,
    title: "What gets a listing",
    body: "MCP servers published to the official registry, skills in public SKILL.md repositories, and plugins that ship a manifest plus a version-pinned git source.",
  },
  {
    icon: GitBranch,
    title: "What makes it installable",
    body: "Verified metadata and a live endpoint for servers; a fetchable source for skills; a pinned commit for plugins. Everything else stays discovery-only — stated up front, never hidden.",
  },
  {
    icon: Sparkles,
    title: "Publisher identity is preserved",
    body: "Your publisher name, repository link, and release tags travel with the listing everywhere it appears. Corrections flow through the same generated dataset.",
  },
];

export function PublishView() {
  const navigate = useApp((s) => s.navigate);
  const [kind, setKind] = React.useState("publisher");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [listing, setListing] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setState("sending");
    try {
      const response = await fetch("/api/litespm/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, email, listing, message }),
      });
      const data = (await response.json()) as { ok?: boolean; errors?: Record<string, string> };
      if (response.ok && data.ok) {
        setState("sent");
      } else {
        setErrors(data.errors ?? { form: "Something went wrong — please try again." });
        setState("idle");
      }
    } catch {
      setErrors({ form: "Network error — please try again." });
      setState("idle");
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      {/* Hero */}
      <div className="max-w-[62ch]">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-brand">
          Publish
        </p>
        <h1 className="mt-2 text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.04em]">
          Get your capability in front of every agent.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          The catalog aggregates publisher-published data — it does not curate entries. Here is
          what that means for yours, and where to send it.
        </p>
      </div>

      {/* Standards */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {STANDARDS.map((standard, i) => (
          <motion.div
            key={standard.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-2xl border border-border/70 bg-card p-5"
          >
            <standard.icon className="h-5 w-5 text-brand" />
            <h2 className="mt-3 text-[15px] font-semibold tracking-tight">{standard.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {standard.body}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Form */}
        <section className="rounded-2xl border border-border/70 bg-card p-6" aria-labelledby="form-title">
          <h2 id="form-title" className="flex items-center gap-2 text-[17px] font-semibold">
            <MessageSquare className="h-4 w-4 text-brand" /> Submit a listing or a correction
          </h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Submissions are stored by this deployment and reviewed against the generated dataset.
          </p>

          {state === "sent" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-6 rounded-xl border border-brand/30 bg-brand-soft/70 p-6 text-center"
            >
              <CheckCircle2 className="mx-auto h-8 w-8 text-brand" />
              <p className="mt-3 text-[15px] font-semibold">Received — thank you.</p>
              <p className="mx-auto mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-muted-foreground">
                Your submission is recorded. If it asks for a listing, it will be reviewed against
                the publisher&apos;s own published record before anything changes.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setState("idle");
                    setMessage("");
                    setListing("");
                  }}
                >
                  Submit another
                </Button>
                <Button
                  className="rounded-xl bg-brand text-brand-foreground hover:bg-brand/90"
                  onClick={() => navigate("#/explore")}
                >
                  Browse the catalog
                </Button>
              </div>
            </motion.div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
              <div>
                <Label htmlFor="feedback-kind" className="text-[12.5px]">
                  What is this about?
                </Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger id="feedback-kind" className="mt-1.5 h-10 rounded-lg text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="feedback-name" className="text-[12.5px]">
                    Your name
                  </Label>
                  <Input
                    id="feedback-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ada Lovelace"
                    className="mt-1.5 h-10 rounded-lg text-[13px]"
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name && <p className="mt-1 text-[11.5px] text-destructive">{errors.name}</p>}
                </div>
                <div>
                  <Label htmlFor="feedback-email" className="text-[12.5px]">
                    Email
                  </Label>
                  <Input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 h-10 rounded-lg text-[13px]"
                    aria-invalid={Boolean(errors.email)}
                  />
                  {errors.email && (
                    <p className="mt-1 text-[11.5px] text-destructive">{errors.email}</p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="feedback-listing" className="text-[12.5px]">
                  Listing reference <span className="text-muted-foreground/60">(optional)</span>
                </Label>
                <Input
                  id="feedback-listing"
                  value={listing}
                  onChange={(e) => setListing(e.target.value)}
                  placeholder="Package name, e.g. neon-mcp, or a GitHub repo URL"
                  className="mt-1.5 h-10 rounded-lg font-mono text-[12px]"
                />
                {errors.listing && (
                  <p className="mt-1 text-[11.5px] text-destructive">{errors.listing}</p>
                )}
              </div>

              <div>
                <Label htmlFor="feedback-message" className="text-[12.5px]">
                  Details
                </Label>
                <Textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    kind === "publisher"
                      ? "Where is it published? (registry namespace, repo URL, pinned tag…)"
                      : "What is wrong, and what should it say?"
                  }
                  className="mt-1.5 min-h-[120px] rounded-lg text-[13px]"
                  aria-invalid={Boolean(errors.message)}
                />
                {errors.message && (
                  <p className="mt-1 text-[11.5px] text-destructive">{errors.message}</p>
                )}
              </div>

              {errors.form && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
                  {errors.form}
                </p>
              )}

              <Button
                type="submit"
                disabled={state === "sending"}
                className="h-10 rounded-xl bg-brand px-5 text-[13.5px] font-semibold text-brand-foreground hover:bg-brand/90"
              >
                {state === "sending" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Submit
                  </>
                )}
              </Button>
            </form>
          )}
        </section>

        {/* Side notes */}
        <aside className="space-y-5">
          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              By kind
            </h2>
            <dl className="mt-3 space-y-3.5 text-[12.5px] leading-relaxed">
              <div>
                <dt className="font-semibold text-foreground">MCP server</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  Publish to the official MCP registry. A verified record with a live endpoint
                  makes the listing installable.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Skill</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  A public repository whose folders carry a SKILL.md. Skills install through the
                  content-addressed ledger.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Plugin</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  A manifest declaring skills and MCP servers, plus a version-pinned git source.
                  Unpinned sources are refused with the reason.
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-border/70 bg-card p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Also known as
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              The catalog dedupes across sources: the same capability published under two names
              keeps one listing with both identities. If yours is split or merged wrong, submit a
              correction with both references.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
