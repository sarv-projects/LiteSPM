import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Blocks, Cable, Sparkles } from "lucide-react";
import { Header } from "../../components/navigation/Header";
import { SiteFooter } from "../../components/layout/SiteFooter";
import { SubmitListingForm } from "./SubmitListingForm";
import { REPO_URL } from "../../lib/site";

const ISSUES_URL = REPO_URL + "/issues";

export const metadata: Metadata = {
  title: "Submit a listing",
  description: "Suggest an MCP server, agent skill or plugin for the LiteSPM catalog.",
  alternates: { canonical: "/submit/" },
  openGraph: { title: "Submit a listing · LiteSPM", url: "/submit/" },
};

const TYPES = [
  {
    icon: Cable,
    label: "MCP server",
    title: "Connect an agent to a service",
    description: "Give agents a documented way to work with an API, database, or online service.",
    kind: "mcp",
  },
  {
    icon: Sparkles,
    label: "Agent skill",
    title: "Add a repeatable workflow",
    description: "Share a skill that gives an agent clear instructions for a useful task.",
    kind: "skill",
  },
  {
    icon: Blocks,
    label: "Plugin",
    title: "Bundle agent capabilities",
    description: "Connect a published plugin with the manifest and source that define its contents.",
    kind: "plugin",
  },
] as const;

export default function SubmitPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main id="main" tabIndex={-1} className="flex-1 pb-16">
        <section className="shell submit-hero" aria-labelledby="submit-title">
          <div className="submit-hero-copy">
            <p className="kicker">For creators</p>
            <h1 id="submit-title">Bring your agent project to LiteSPM</h1>
            <p className="submit-hero-summary">
              Add a skill, MCP server, or plugin to the place people already go to find agent tools.
            </p>
            <div className="submit-hero-links">
              <Link className="btn" href="/docs/#publish">Publisher guide</Link>
              <a className="link inline-flex items-center gap-2" href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
                Ask about a listing <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <div className="submit-steps" aria-label="Submission steps">
              <div><span>01</span><p>Share the source and setup</p></div>
              <div><span>02</span><p>Review the details on GitHub</p></div>
              <div><span>03</span><p>People discover the install path</p></div>
            </div>
            <p className="submit-trust-line">Free to submit · No paid placement · Source-linked listings</p>
          </div>
          <SubmitListingForm />
        </section>

        <section className="shell submit-types-section" aria-labelledby="listing-types-title">
          <div className="submit-section-heading">
            <div>
              <p className="kicker">One catalog, many capabilities</p>
              <h2 id="listing-types-title">What can you add?</h2>
            </div>
            <p>Help people understand what your project does and how they can set it up.</p>
          </div>
          <div className="submit-types-grid">
            {TYPES.map(({ icon: Icon, label, title, description, kind }) => (
              <article key={kind} className="market-category-card submit-type-card">
                <span className={"meta-kind meta-kind-" + kind}>{label}</span>
                <Icon className="submit-type-icon" aria-hidden="true" />
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="shell submit-review-section" aria-labelledby="review-title">
          <div className="submit-review-copy">
            <p className="kicker">A straightforward review</p>
            <h2 id="review-title">Clear sources. Useful setup details.</h2>
            <p>
              The LiteSPM team reviews the publisher source, installation information, and any compatibility details you provide. Listing pages link back to the source and show the setup path available in LiteSPM.
            </p>
          </div>
          <div className="submit-review-card">
            <span className="submit-review-mark" aria-hidden="true">✓</span>
            <div>
              <h3>Already in the catalog?</h3>
              <p>Tell us if a project moved, its setup changed, or a listing needs an update.</p>
              <a className="link inline-flex items-center gap-2" href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
                Contact the maintainers <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
