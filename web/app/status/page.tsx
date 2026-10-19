import type { Metadata } from "next";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { HealthProbe } from "./HealthProbe";
import release from "../../data/release.json";
import { REPO_URL } from "../../lib/site";

/**
 * `/status`.
 *
 * Two things, kept apart on purpose, because they are two different things
 * and merging them is how a status page starts lying:
 *
 *   1. **The published catalog release** — a data stamp. It says which release
 *      the snapshot in this build was cut from, and how many entries that
 *      release carried. It is a fact about a file, not about a running
 *      service, and it does not change when the origin does.
 *   2. **The site and the origin** — what can actually be measured. This site
 *      is a static export: there is no application server, no database and no
 *      health endpoint behind it, so it cannot report its own uptime. The one
 *      thing it *can* measure is a request the reader's own browser makes for
 *      the catalog pointer, and that is the only measurement on this page.
 *
 * There is no uptime percentage here, no "all systems operational", and no
 * incident history, because nothing measures those. The page says so in one
 * line rather than filling the space with a number nobody can check.
 */
export const metadata: Metadata = {
  title: "Status",
  description:
    "The catalog release this site was built from, and the one health check it can honestly make — a single request for the catalog pointer, from your browser.",
  alternates: { canonical: "/status/" },
  openGraph: { title: "Status · LiteSPM Market", url: "/status/" },
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "17 October 2026, 07:53 UTC" — UTC, so the string never depends on the reader. */
function snapshotLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  const time = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${time} UTC`;
}

const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
const RELEASES_URL = `${REPO_URL}/releases`;
const NPM_URL = "https://www.npmjs.com/package/litespm";

export default function StatusPage() {
  const itemCount = Number(release.itemCount ?? release.totalCapabilities ?? 0);

  return (
    <InfoPage
      title="Status"
      lede="Two separate facts: the catalog release this site was built from, and the one health check this site can actually make. Neither of them is an uptime figure, because nothing here measures one."
      sourcePath="web/app/status/page.tsx"
    >
      <InfoSection title="The catalog release — a data stamp">
        <p>
          This is a stamp on the data, not a service status. It says which catalog release the
          snapshot in this build was cut from, and how many entries that release carried. It does
          not say whether anything is running now, and it does not change when the origin does.
        </p>
        <Facts>
          <Fact label="Release id">
            <code>{release.releaseId}</code>
          </Fact>
          <Fact label="Sequence">
            <code>{release.sequence}</code> — the release number, counted forward. Release ids are
            immutable, so a release is never rewritten in place.
          </Fact>
          <Fact label="Entries">
            {itemCount.toLocaleString()} catalog entries in this release:{" "}
            {Number(release.mcpServersCount ?? 0).toLocaleString()} MCP servers,{" "}
            {Number(release.agentSkillsCount ?? 0).toLocaleString()} skills and{" "}
            {Number(release.pluginsCount ?? 0).toLocaleString()} plugins.
          </Fact>
          <Fact label="Snapshot">
            {snapshotLabel(release.createdAt)} — the moment the dataset was cut, not the moment this
            page was built.
          </Fact>
          <Fact label="Where it comes from">
            The build ships these numbers in <code>data/release.json</code>, stamped by the same
            command that published the release. The origin serves the same pointer at{" "}
            <code>/v1/current.json</code>, and the origin keeps the current release only: an older
            release id no longer resolves.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="The site and the origin — what is measured">
        <p>
          This site is a static export. There is no application server, no database and no health
          endpoint behind it, so it cannot report its own uptime. It publishes no uptime history, no
          incident log and no availability promise, and there is no number on this page that nothing
          measured.
        </p>
        <div className="rounded-panel border border-rule bg-sunken px-4 py-3.5">
          <HealthProbe />
        </div>
        <p>
          The same check, on your own machine: <code>litespm catalog sync</code> fetches that
          pointer, verifies it and the manifest it names, and refuses to index a chunk whose digest
          does not match.
        </p>
      </InfoSection>

      <InfoSection title="Where to look when you want the detail">
        <Facts>
          <Fact label="Changelog">
            <a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer" className="link">
              CHANGELOG.md
            </a>{" "}
            in the repository — every release, what it added, and what it changed.
          </Fact>
          <Fact label="CLI releases">
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="link">
              The releases page
            </a>{" "}
            carries the binaries, the checksum listing, the signature bundles and the software
            bill of materials for each tag.
          </Fact>
          <Fact label="The npm package">
            <a href={NPM_URL} target="_blank" rel="noopener noreferrer" className="link">
              litespm on npm
            </a>{" "}
            — what <code>npm install -g litespm</code> installs.
          </Fact>
          <Fact label="This page">
            It ships with the source and changes when the source does, so it carries no &ldquo;last
            updated&rdquo; stamp of its own. The snapshot date above is the data&rsquo;s date.
          </Fact>
        </Facts>
      </InfoSection>
    </InfoPage>
  );
}
