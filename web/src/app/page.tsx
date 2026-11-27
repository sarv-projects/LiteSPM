import { LiteSPMApp } from "@/components/litespm/app";

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "LiteSPM",
      url: process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://litespm-web.sarveshbh-2022.workers.dev",
      sameAs: ["https://github.com/sarv-projects/LiteSPM"],
    },
    {
      "@type": "SoftwareApplication",
      name: "LiteSPM",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Windows, macOS, Linux",
      description:
        "Local-first package manager for AI agents unifying MCP servers, agent skills, and plugins across 52+ hosts with diff previews, backups, and byte-exact rollback.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(HOME_JSON_LD).replace(/</g, "\\u003c"),
        }}
      />
      <LiteSPMApp />
    </>
  );
}
