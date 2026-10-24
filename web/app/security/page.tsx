import type { Metadata } from "next";
import Link from "next/link";
import { Fact, Facts, InfoPage, InfoSection } from "../../components/layout/InfoPage";
import { REPO_URL } from "../../lib/site";

/**
 * `/security`.
 *
 * The repository's `SECURITY.md` is the policy. This page is a plain-language
 * summary of the boundaries in it, and it adds no claim the policy does not
 * make — no certification, no audit badge, no promise about anybody else's
 * code. Where a reader needs the binding text, the link is in the first
 * section.
 *
 * The page deliberately does not restate the terms of use or the privacy
 * policy: those live on the{" "}
 * <Link href="/terms/">terms</Link> and <Link href="/privacy/">privacy</Link>{" "}
 * pages, and inventing a second version of them here would create two texts
 * that could drift apart.
 */
export const metadata: Metadata = {
  title: "Security",
  description:
    "How to report a vulnerability, what LiteSPM is trusted to do, and the boundaries it does not cross: it does not audit publishers' code, a verified badge is not a security review, and installed code is not sandboxed.",
  alternates: { canonical: "/security/" },
  openGraph: { title: "Security · LiteSPM", url: "/security/" },
};

const SECURITY_MD_URL = `${REPO_URL}/blob/main/SECURITY.md`;
const ADVISORY_URL = `${REPO_URL}/security/advisories/new`;

export default function SecurityPage() {
  return (
    <InfoPage
      title="Security"
      lede="See how LiteSPM handles agent configuration, local credentials, package sources, and vulnerability reports."
      sourcePath="web/app/security/page.tsx"
    >
      <InfoSection title="Where the policy lives">
        <Facts>
          <Fact label="The policy">
            <a href={SECURITY_MD_URL} target="_blank" rel="noopener noreferrer" className="link">
              SECURITY.md in the repository
            </a>{" "}
            is the source of truth. This page summarises it; where the two differ, the file wins.
          </Fact>
          <Fact label="How to report">
            Open a{" "}
            <a href={ADVISORY_URL} target="_blank" rel="noopener noreferrer" className="link">
              private security advisory
            </a>
            . Please do not open a public issue for a vulnerability: LiteSPM edits the
            configuration files of other tools and brokers credentials, so a public report is a
            working exploit for everyone until a fix ships. You do not need a working exploit to
            report one. The policy also names the maintainer listed on the GitHub profile as an
            alternative route.
          </Fact>
          <Fact label="What to include">
            The version (<code>litespm version</code>), your operating system, the exact steps, and
            the impact you believe it has.
          </Fact>
          <Fact label="Acknowledgement">
            The policy commits to acknowledging a report within seven days. There is no bug bounty,
            and credit is given in the advisory unless you ask otherwise.
          </Fact>
          <Fact label="Which versions are fixed">
            Only the latest published release receives security fixes. There are no
            long-term-support branches.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="What LiteSPM is trusted to do">
        <p>
          This is a small tool asking for a large amount of trust, so the policy states the
          boundaries plainly. These are its rows, in shorter words.
        </p>
        <Facts>
          <Fact label="Host config adapters">
            Write one <code>litespm</code> entry into an agent&rsquo;s configuration file. The file
            is backed up first; only that member is touched; the result is re-parsed and asserted
            before anything is written; and every write has an inverse (
            <code>litespm host remove</code>).
          </Fact>
          <Fact label="Bridge shim">
            Proxy MCP traffic between an agent and the daemon over stdio. It holds no credentials
            and makes no network calls of its own.
          </Fact>
          <Fact label="Daemon">
            Supervise provider processes, enforce policy and broker secrets. Secrets go to the
            operating system&rsquo;s vault — Keychain, DPAPI, Secret Service — and never into a
            configuration file.
          </Fact>
          <Fact label="Skill installer">
            Copy a <code>SKILL.md</code> directory into an agent&rsquo;s skills tree. It refuses
            symlinks, non-regular files, <code>http://</code>, <code>file:</code> and{" "}
            <code>ftp://</code> sources, and an overwrite without <code>--force</code> — which
            prints what it is overwriting, records a pre-image digest, and takes a byte-exact backup
            first.
          </Fact>
          <Fact label="Self-update">
            Replace its own binary. It fails closed on a missing checksum, and verifies the
            release&rsquo;s signature bundle when the release publishes one.
          </Fact>
          <Fact label="Untrusted input">
            Catalog entries, upstream manifests, repository READMEs, MCP tool descriptions and
            results, and skill contents are treated as data and never followed as instructions. A
            <code>SKILL.md</code> is instructions your agent will follow, which is why installing
            one is a prompt surface and not just a file copy.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="The boundaries that matter to you">
        <Facts>
          <Fact label="Publisher sources are identified">
            Publisher badges distinguish listings read from a project's own manifest from entries
            collected by a community directory.
          </Fact>
          <Fact label="Installs are previewed and backed up — the code is not sandboxed">
            You see the plan, you approve it, and the configuration file is copied before it is
            edited. After that, the capability runs with your permissions, on your machine, exactly
            as it would if you had installed it by hand. Read the project before you install it.
          </Fact>
          <Fact label="Compatibility follows setup requirements">
            A package appears for an agent when its source details and that agent&rsquo;s
            configuration format support a clear setup path.
          </Fact>
        </Facts>
      </InfoSection>

      <InfoSection title="The supply chain, and where it stops">
        <p>
          Each release publishes a checksum listing beside the binaries, signs every artifact with
          a keyless signature, publishes the signature bundle and a software bill of materials
          alongside them, and the updater verifies the download against both before it replaces
          anything. A missing checksum, a mismatch, or a signature that does not verify is a
          refusal: the download is discarded and the installer exits non-zero rather than running
          an unverified binary. The npm installer verifies the same bundle, and requires a
          signature by default.
        </p>
        <p>
          The limit is worth stating plainly. Checksums travel in the same release as the binaries,
          so they prove the download was not corrupted in transit but not that it is authentic. The
          signature closes that gap only as far as the signing identity is trustworthy — the
          certificate binds an artifact to this repository&rsquo;s release workflow running on a
          tag, so the trust root is GitHub plus this repository&rsquo;s write controls. Somebody who
          can edit the release workflow can sign what that workflow signs.
        </p>
      </InfoSection>

      <InfoSection title="The rest of the legal text">
        <p>
          This page is a summary of a technical policy, not a contract. The terms of use — the
          license, the warranty disclaimer, and what a listing on this site does and does not mean —
          are on the <Link href="/terms/">terms page</Link>. What this site keeps in your browser,
          and what the <code>litespm</code> command sends over the network, are on the{" "}
          <Link href="/privacy/">privacy page</Link>. The support channel, and what to put in a
          report, are on the <Link href="/support/">support page</Link>.
        </p>
      </InfoSection>

      <InfoSection title="Ready to try it">
        <p>
          <Link href="/get-started/">Get started</Link> previews the installation plan. You approve
          the installation plan before LiteSPM writes it. Installed capabilities are not sandboxed
          and may run with your permissions; review them before use.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
