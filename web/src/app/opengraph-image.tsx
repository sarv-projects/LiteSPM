import { ImageResponse } from "next/og";
import facts from "@/lib/litespm/site-facts.json";

// The link-preview card. Rendered by Next at build time from the same
// generated site facts the pages print, so its counts cannot drift from them
// (the static og.png it replaces still said "50 agent hosts" and named the
// retired workers.dev origin).
export const alt = "LiteSPM — The package manager for AI agents";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SITE_HOST = "lite-spm-nine.vercel.app";

export default function OpengraphImage() {
  const listings = `${Math.floor(facts.listings / 1000)}k+`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px",
          background: "linear-gradient(135deg, #0b1020 0%, #111a33 55%, #1b2550 100%)",
          color: "#e8ecf8",
          fontFamily: "sans-serif",
          borderLeft: "12px solid #4f6bff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: "#4f6bff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            {">_"}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44, fontWeight: 700 }}>LiteSPM</div>
            <div style={{ fontSize: 20, letterSpacing: 4, color: "#9aa6c9" }}>
              MCP SERVERS · AGENT SKILLS · PLUGINS
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
            The package manager
          </div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: "#8ea2ff" }}>
            for AI agents
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #2a3560",
            paddingTop: 28,
            fontSize: 24,
            color: "#c3cbe6",
          }}
        >
          <div style={{ display: "flex" }}>{SITE_HOST}</div>
          <div style={{ display: "flex" }}>
            {`${listings} listings · ${facts.hosts} agent hosts · npm i -g litespm`}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
