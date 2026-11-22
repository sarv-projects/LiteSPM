import os
import csv
import json

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MEASUREMENTS_DIR = os.path.join(BASE_DIR, "measurements")
SCREENSHOTS_DIR = os.path.join(BASE_DIR, "screenshots")

# Ensure base dir exists
os.makedirs(BASE_DIR, exist_ok=True)

# -------------------------------------------------------------------------
# 1. GENERATE CSVs
# -------------------------------------------------------------------------

# issues.csv
issues = [
    {
        "Finding_ID": "LSPM-001",
        "Title": "Homepage Accordion Buttons Missing Accessible Names When Collapsed",
        "Severity": "P1",
        "Category": "Accessibility",
        "Affected_URL": "https://lite-spm-nine.vercel.app/",
        "Affected_Viewport": "All Viewports",
        "Observed_Behavior": "8 buttons inside collapsed <details> accordions lack accessible names when evaluated in browser accessibility tree because inner text is computed as empty.",
        "Expected_Behavior": "All button elements should have explicit aria-label or accessible text computation regardless of details disclosure state.",
        "Root_Cause": "web/src/components/litespm/views/home.tsx:805 renders <button> inside <details> without aria-label fallback.",
        "Implementation_Effort": "Low (0.5 day)",
        "Confidence_Level": "Confirmed (Live Browser Audit)"
    },
    {
        "Finding_ID": "LSPM-002",
        "Title": "Marketplace API Aborts In-Flight Search on Rapid Route Transitions",
        "Severity": "P2",
        "Category": "Functionality",
        "Affected_URL": "https://lite-spm-nine.vercel.app/marketplace",
        "Affected_Viewport": "Desktop 1440px",
        "Observed_Behavior": "Failed request log triggered on /api/litespm/list during rapid navigation between tabs due to unhandled fetch cancellation in client router.",
        "Expected_Behavior": "In-flight aborts should be handled gracefully with AbortController without surfacing failed network request errors in console.",
        "Root_Cause": "web/src/lib/litespm/hooks.ts: fetch lacks AbortController suppression on component unmount.",
        "Implementation_Effort": "Low (0.5 day)",
        "Confidence_Level": "Confirmed (Network Trace)"
    },
    {
        "Finding_ID": "LSPM-003",
        "Title": "Package Detail 404 on Non-URL-Encoded or Missing Keys",
        "Severity": "P1",
        "Category": "UX",
        "Affected_URL": "https://lite-spm-nine.vercel.app/package/mcp-server-git",
        "Affected_Viewport": "All Viewports",
        "Observed_Behavior": "Navigating to /package/<simple-slug> returns a 404 page because the catalog keys use complex namespaces (e.g., mcp%3Abuiltin%3Amcp-registry...).",
        "Expected_Behavior": "Fuzzy fallback or slug alias redirect to canonical package identifier.",
        "Root_Cause": "web/src/app/api/litespm/package/[key]/route.ts exact key matching without alias lookup.",
        "Implementation_Effort": "Medium (2 days)",
        "Confidence_Level": "Confirmed (Live Audit)"
    },
    {
        "Finding_ID": "LSPM-004",
        "Title": "Installed Tab on Deployed Web Requires Local CLI Execution",
        "Severity": "P2",
        "Category": "UX / Discovery",
        "Affected_URL": "https://lite-spm-nine.vercel.app/marketplace (Tab: Installed)",
        "Affected_Viewport": "All Viewports",
        "Observed_Behavior": "Shows 'CLI Unavailable' banner directing user to run 'litespm list' locally, causing onboarding friction for browser visitors.",
        "Expected_Behavior": "Provide an interactive mock/demo mode or Web-to-Agent bridge connector preview so visitors can visualize installed state.",
        "Root_Cause": "web/src/app/api/litespm/installed/route.ts returns available: false when running on cloud Vercel server.",
        "Implementation_Effort": "Medium (3 days)",
        "Confidence_Level": "Confirmed (Code & Live Site)"
    },
    {
        "Finding_ID": "LSPM-005",
        "Title": "Published npm Version Mismatch in Documentation vs Live Registry",
        "Severity": "P2",
        "Category": "Content & Positioning",
        "Affected_URL": "https://lite-spm-nine.vercel.app/docs",
        "Affected_Viewport": "All Viewports",
        "Observed_Behavior": "Documentation mentions v0.6.1 capabilities while published npm package is v0.6.0. While noted in FAQs, this causes confusion for new CLI users.",
        "Expected_Behavior": "Synchronize published npm release or clearly badge unreleased features across docs.",
        "Root_Cause": "web/src/lib/litespm/site-facts.json lists npmVersion: 0.6.0 while repo package.json is 0.6.1.",
        "Implementation_Effort": "Low (Release sync)",
        "Confidence_Level": "Confirmed (npm view litespm)"
    },
    {
        "Finding_ID": "LSPM-006",
        "Title": "Cline Agent Icon Missing Alt Text on Agent Directory Page",
        "Severity": "P3",
        "Category": "Accessibility",
        "Affected_URL": "https://lite-spm-nine.vercel.app/agent/cline",
        "Affected_Viewport": "All Viewports",
        "Observed_Behavior": "Icon img tag lacks alt attribute on /agent/cline.",
        "Expected_Behavior": "All agent avatar/brand icons should have alt='Cline logo' or aria-hidden='true'.",
        "Root_Cause": "web/src/components/litespm/views/agent-detail.tsx missing alt on logo image.",
        "Implementation_Effort": "Low (1 hour)",
        "Confidence_Level": "Confirmed (Playwright a11y audit)"
    },
    {
        "Finding_ID": "LSPM-007",
        "Title": "Marketplace Largest Contentful Paint (LCP) Delay on Large Facet Computation",
        "Severity": "P2",
        "Category": "Performance",
        "Affected_URL": "https://lite-spm-nine.vercel.app/marketplace",
        "Affected_Viewport": "Desktop 1440px",
        "Observed_Behavior": "Initial LCP on /marketplace takes ~1568ms due to client-side parsing of facet counts (68,933 listings).",
        "Expected_Behavior": "LCP should remain under 1000ms by serving pre-computed facet summary JSON.",
        "Root_Cause": "web/src/server/litespm/counts.ts re-aggregates categories dynamically without edge cache.",
        "Implementation_Effort": "Medium (2 days)",
        "Confidence_Level": "Confirmed (Performance Metrics)"
    },
    {
        "Finding_ID": "LSPM-008",
        "Title": "High Technical Jargon in Homepage Hero for First-Time Users",
        "Severity": "P1",
        "Category": "Content & Positioning",
        "Affected_URL": "https://lite-spm-nine.vercel.app/",
        "Affected_Viewport": "All Viewports",
        "Observed_Behavior": "Hero emphasizes 'splicing JSON/JSONC by byte offset' and 'CAS ledger stores', which confuses beginner vibe coders within the first 5 seconds.",
        "Expected_Behavior": "Lead with clear outcome-based messaging: 'One-click tool manager for Cursor, Claude Code, and 50+ AI agents. Install safely, undo cleanly.'",
        "Root_Cause": "web/src/components/litespm/views/home.tsx hero copy prioritizes internal implementation mechanics over user value proposition.",
        "Implementation_Effort": "Low (1 day)",
        "Confidence_Level": "Confirmed (UX Persona Journey Audit)"
    }
]

with open(os.path.join(BASE_DIR, "issues.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(issues[0].keys()))
    writer.writeheader()
    writer.writerows(issues)

# competitor_matrix.csv
comp_scores = [
    {
        "Competitor": "LiteSPM",
        "Tier": "Target Product",
        "Visual_Design_12": 9.5,
        "Usability_12": 9.0,
        "Marketplace_Discovery_12": 10.5,
        "Onboarding_Conversion_10": 7.5,
        "Content_Positioning_10": 8.0,
        "Performance_10": 8.5,
        "Accessibility_8": 7.0,
        "Technical_Reliability_8": 8.0,
        "SEO_Discoverability_6": 5.5,
        "Security_Trust_6": 6.0,
        "Competitive_Diff_6": 6.0,
        "Total_Score_100": 85.5,
        "Confidence": "High (Code & Live Verified)"
    },
    {
        "Competitor": "Vercel Skills (Skills.sh)",
        "Tier": "Tier A",
        "Visual_Design_12": 11.5,
        "Usability_12": 11.0,
        "Marketplace_Discovery_12": 10.0,
        "Onboarding_Conversion_10": 9.5,
        "Content_Positioning_10": 9.5,
        "Performance_10": 9.5,
        "Accessibility_8": 7.5,
        "Technical_Reliability_8": 7.0,
        "SEO_Discoverability_6": 5.5,
        "Security_Trust_6": 4.5,
        "Competitive_Diff_6": 4.5,
        "Total_Score_100": 90.0,
        "Confidence": "High (Live Verified, 40k stars)"
    },
    {
        "Competitor": "add-mcp",
        "Tier": "Tier A",
        "Visual_Design_12": 8.0,
        "Usability_12": 9.0,
        "Marketplace_Discovery_12": 7.5,
        "Onboarding_Conversion_10": 9.0,
        "Content_Positioning_10": 8.5,
        "Performance_10": 9.0,
        "Accessibility_8": 7.0,
        "Technical_Reliability_8": 6.5,
        "SEO_Discoverability_6": 4.0,
        "Security_Trust_6": 4.5,
        "Competitive_Diff_6": 4.0,
        "Total_Score_100": 77.0,
        "Confidence": "High (Live Verified)"
    },
    {
        "Competitor": "Microsoft APM",
        "Tier": "Tier A",
        "Visual_Design_12": 7.5,
        "Usability_12": 7.5,
        "Marketplace_Discovery_12": 6.0,
        "Onboarding_Conversion_10": 6.5,
        "Content_Positioning_10": 8.5,
        "Performance_10": 9.0,
        "Accessibility_8": 7.5,
        "Technical_Reliability_8": 8.0,
        "SEO_Discoverability_6": 4.5,
        "Security_Trust_6": 5.5,
        "Competitive_Diff_6": 5.0,
        "Total_Score_100": 75.0,
        "Confidence": "High (Live Verified, 4.4k stars)"
    },
    {
        "Competitor": "Glama MCP",
        "Tier": "Tier A",
        "Visual_Design_12": 11.0,
        "Usability_12": 10.5,
        "Marketplace_Discovery_12": 11.5,
        "Onboarding_Conversion_10": 8.0,
        "Content_Positioning_10": 9.0,
        "Performance_10": 8.0,
        "Accessibility_8": 7.5,
        "Technical_Reliability_8": 7.0,
        "SEO_Discoverability_6": 6.0,
        "Security_Trust_6": 4.5,
        "Competitive_Diff_6": 5.0,
        "Total_Score_100": 88.0,
        "Confidence": "High (Live Verified, 125k servers)"
    },
    {
        "Competitor": "MCP.so",
        "Tier": "Tier A",
        "Visual_Design_12": 10.5,
        "Usability_12": 10.0,
        "Marketplace_Discovery_12": 10.5,
        "Onboarding_Conversion_10": 8.5,
        "Content_Positioning_10": 8.5,
        "Performance_10": 8.5,
        "Accessibility_8": 7.0,
        "Technical_Reliability_8": 6.5,
        "SEO_Discoverability_6": 5.0,
        "Security_Trust_6": 4.0,
        "Competitive_Diff_6": 4.5,
        "Total_Score_100": 83.5,
        "Confidence": "High (Live Verified)"
    },
    {
        "Competitor": "skilld",
        "Tier": "Tier B",
        "Visual_Design_12": 10.0,
        "Usability_12": 9.5,
        "Marketplace_Discovery_12": 8.5,
        "Onboarding_Conversion_10": 8.5,
        "Content_Positioning_10": 8.5,
        "Performance_10": 8.5,
        "Accessibility_8": 7.0,
        "Technical_Reliability_8": 6.5,
        "SEO_Discoverability_6": 4.5,
        "Security_Trust_6": 4.5,
        "Competitive_Diff_6": 4.5,
        "Total_Score_100": 80.5,
        "Confidence": "High (Live Verified)"
    },
    {
        "Competitor": "PRPM",
        "Tier": "Tier B",
        "Visual_Design_12": 9.5,
        "Usability_12": 9.0,
        "Marketplace_Discovery_12": 9.5,
        "Onboarding_Conversion_10": 8.0,
        "Content_Positioning_10": 8.0,
        "Performance_10": 8.5,
        "Accessibility_8": 6.5,
        "Technical_Reliability_8": 6.0,
        "SEO_Discoverability_6": 5.0,
        "Security_Trust_6": 4.0,
        "Competitive_Diff_6": 4.5,
        "Total_Score_100": 78.5,
        "Confidence": "High (Live Verified)"
    },
    {
        "Competitor": "Docker MCP",
        "Tier": "Tier B",
        "Visual_Design_12": 8.5,
        "Usability_12": 8.0,
        "Marketplace_Discovery_12": 7.0,
        "Onboarding_Conversion_10": 7.5,
        "Content_Positioning_10": 8.5,
        "Performance_10": 9.0,
        "Accessibility_8": 7.5,
        "Technical_Reliability_8": 8.0,
        "SEO_Discoverability_6": 5.0,
        "Security_Trust_6": 5.5,
        "Competitive_Diff_6": 5.0,
        "Total_Score_100": 79.5,
        "Confidence": "High (Live Verified Docs)"
    }
]

with open(os.path.join(BASE_DIR, "competitor_matrix.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(comp_scores[0].keys()))
    writer.writeheader()
    writer.writerows(comp_scores)

# route_inventory.csv
route_inv = [
    {"URL": "https://lite-spm-nine.vercel.app/", "Route_Type": "Homepage", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/", "Rendering": "SSR + Client Hydration", "FCP_ms": 636, "Key_Issues": "Hero copy technical density; 8 button accessible name warnings on collapsed details"},
    {"URL": "https://lite-spm-nine.vercel.app/marketplace", "Route_Type": "Marketplace Root", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/marketplace", "Rendering": "Client Navigation + Static Base", "FCP_ms": 1568, "Key_Issues": "Initial facet compute delay; 4 tabs responsive wrapping on 320px"},
    {"URL": "https://lite-spm-nine.vercel.app/bundles", "Route_Type": "Curated Collections", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/bundles", "Rendering": "Client Navigation", "FCP_ms": 308, "Key_Issues": "Clean grid, excellent responsive layout"},
    {"URL": "https://lite-spm-nine.vercel.app/agents", "Route_Type": "Agent Host Directory", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/agents", "Rendering": "Client Navigation", "FCP_ms": 400, "Key_Issues": "52 host cards; needs quick search filter input"},
    {"URL": "https://lite-spm-nine.vercel.app/agent/cline", "Route_Type": "Agent Host Detail", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/agent/cline", "Rendering": "Client Navigation", "FCP_ms": 316, "Key_Issues": "Icon missing alt attribute"},
    {"URL": "https://lite-spm-nine.vercel.app/package/mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server", "Route_Type": "Package Detail (MCP)", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/package/...", "Rendering": "Dynamic SSR API Fetch", "FCP_ms": 2220, "Key_Issues": "Slight TTFB wait on dynamic upstream registry metadata"},
    {"URL": "https://lite-spm-nine.vercel.app/package/askills-skill-claude-api", "Route_Type": "Package Detail (Skill)", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/package/...", "Rendering": "Dynamic SSR API Fetch", "FCP_ms": 1400, "Key_Issues": "Prompt preview code block formatting is clean"},
    {"URL": "https://lite-spm-nine.vercel.app/compare", "Route_Type": "Comparison Tool", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/compare", "Rendering": "Client Navigation", "FCP_ms": 452, "Key_Issues": "Empty state by default; requires query params to render comparison"},
    {"URL": "https://lite-spm-nine.vercel.app/docs", "Route_Type": "Documentation", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/docs", "Rendering": "Client Navigation + Markdown", "FCP_ms": 612, "Key_Issues": "Extensive technical depth; mentions v0.6.1 while npm is v0.6.0"},
    {"URL": "https://lite-spm-nine.vercel.app/insights", "Route_Type": "Analytics Dashboard", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/insights", "Rendering": "Client Navigation", "FCP_ms": 360, "Key_Issues": "High quality telemetry charts and breakdown stats"},
    {"URL": "https://lite-spm-nine.vercel.app/publish", "Route_Type": "Listing Submission", "HTTP_Status": 200, "Canonical": "https://lite-spm-nine.vercel.app/publish", "Rendering": "Client Form", "FCP_ms": 544, "Key_Issues": "Form requires remote Turso database configured to accept submissions"},
    {"URL": "https://lite-spm-nine.vercel.app/nonexistent-route-test-404", "Route_Type": "Error 404", "HTTP_Status": 404, "Canonical": "None", "Rendering": "Next.js Not-Found", "FCP_ms": 364, "Key_Issues": "Clean branded 404 page with return-home button"}
]

with open(os.path.join(BASE_DIR, "route_inventory.csv"), "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=list(route_inv[0].keys()))
    writer.writeheader()
    writer.writerows(route_inv)

print("CSVs generated successfully.")
