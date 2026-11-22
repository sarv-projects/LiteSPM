import os
import sys
import json
import time
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCREENSHOTS_DIR = os.path.join(BASE_DIR, "screenshots")
MEASUREMENTS_DIR = os.path.join(BASE_DIR, "measurements")

COMPETITORS = [
    {
        "id": "A1_skills_sh",
        "name": "Vercel Skills / Skills.sh",
        "tier": "Tier A",
        "urls": ["https://skills.sh/"],
        "slug": "skills_sh"
    },
    {
        "id": "A2_add_mcp",
        "name": "add-mcp",
        "tier": "Tier A",
        "urls": ["https://add-mcp.com/", "https://add-mcp.com/registry"],
        "slug": "add_mcp"
    },
    {
        "id": "A3_microsoft_apm",
        "name": "Microsoft APM",
        "tier": "Tier A",
        "urls": ["https://microsoft.github.io/apm/"],
        "slug": "microsoft_apm"
    },
    {
        "id": "A4_glama",
        "name": "Glama MCP",
        "tier": "Tier A",
        "urls": ["https://glama.ai/mcp/servers"],
        "slug": "glama"
    },
    {
        "id": "A5_mcp_so",
        "name": "MCP.so",
        "tier": "Tier A",
        "urls": ["https://mcp.so/"],
        "slug": "mcp_so"
    },
    {
        "id": "B1_skilld",
        "name": "skilld",
        "tier": "Tier B",
        "urls": ["https://skilld.dev/"],
        "slug": "skilld"
    },
    {
        "id": "B2_aitmpl",
        "name": "AI Templates",
        "tier": "Tier B",
        "urls": ["https://www.aitmpl.com/"],
        "slug": "aitmpl"
    },
    {
        "id": "B3_prpm",
        "name": "PRPM",
        "tier": "Tier B",
        "urls": ["https://prpm.dev/"],
        "slug": "prpm"
    },
    {
        "id": "B4_smithery",
        "name": "Smithery",
        "tier": "Tier B",
        "urls": ["https://smithery.ai/"],
        "slug": "smithery"
    },
    {
        "id": "B5_docker_mcp",
        "name": "Docker MCP Catalog",
        "tier": "Tier B",
        "urls": ["https://docs.docker.com/ai/mcp-catalog-and-toolkit/"],
        "slug": "docker_mcp"
    },
    {
        "id": "B6_pspm",
        "name": "PSPM",
        "tier": "Tier B",
        "urls": ["https://pspm.dev/"],
        "slug": "pspm"
    },
    {
        "id": "B7_skillbase",
        "name": "Skillbase",
        "tier": "Tier B",
        "urls": ["https://skillbase.space/"],
        "slug": "skillbase"
    }
]

def run_competitor_audit():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        
        for comp in COMPETITORS:
            cid = comp["id"]
            results[cid] = {
                "name": comp["name"],
                "tier": comp["tier"],
                "slug": comp["slug"],
                "pages": {}
            }
            print(f"\nAuditing {comp['name']} ({cid})...")

            for url in comp["urls"]:
                sub_name = comp["slug"]
                if "registry" in url:
                    sub_name += "_registry"
                
                page_data = {"url": url}
                
                # Desktop 1440x900
                context = browser.new_context(
                    viewport={"width": 1440, "height": 900},
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                )
                page = context.new_page()
                t0 = time.time()
                try:
                    resp = page.goto(url, wait_until="domcontentloaded", timeout=25000)
                    time.sleep(1.5) # allow JS hydration
                    status = resp.status if resp else None
                    load_time = time.time() - t0
                    
                    title = page.title()
                    h1 = page.evaluate("() => document.querySelector('h1')?.innerText || ''")
                    meta_desc = page.evaluate("() => document.querySelector('meta[name=\"description\"]')?.content || ''")
                    
                    # Extract command / install snippets
                    code_snippets = page.evaluate("""() => {
                        const codes = Array.from(document.querySelectorAll('pre, code, [class*="command" i], [class*="install" i]'));
                        return codes.map(c => c.innerText.trim()).filter(t => t.length > 5 && t.length < 200).slice(0, 5);
                    }""")
                    
                    # Screenshot desktop
                    desktop_shot = os.path.join(SCREENSHOTS_DIR, f"comp_{sub_name}_desktop_1440.png")
                    page.screenshot(path=desktop_shot, full_page=True)
                    print(f"  Desktop: [{status}] '{title}' ({load_time:.2f}s) -> {desktop_shot}")
                    
                    page_data["desktop"] = {
                        "status": status,
                        "title": title,
                        "h1": h1,
                        "meta_desc": meta_desc,
                        "load_time_s": load_time,
                        "code_snippets": code_snippets,
                        "screenshot": desktop_shot
                    }
                except Exception as e:
                    print(f"  Desktop Error for {url}: {e}")
                    page_data["desktop"] = {"error": str(e)}
                finally:
                    context.close()

                # Mobile 375x667
                context_m = browser.new_context(
                    viewport={"width": 375, "height": 667},
                    user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
                )
                page_m = context_m.new_page()
                try:
                    resp_m = page_m.goto(url, wait_until="domcontentloaded", timeout=25000)
                    time.sleep(1.5)
                    mobile_shot = os.path.join(SCREENSHOTS_DIR, f"comp_{sub_name}_mobile_375.png")
                    page_m.screenshot(path=mobile_shot, full_page=True)
                    print(f"  Mobile: captured -> {mobile_shot}")
                    page_data["mobile"] = {"screenshot": mobile_shot, "status": resp_m.status if resp_m else None}
                except Exception as e:
                    print(f"  Mobile Error for {url}: {e}")
                    page_data["mobile"] = {"error": str(e)}
                finally:
                    context_m.close()

                results[cid]["pages"][url] = page_data

        browser.close()

    with open(os.path.join(MEASUREMENTS_DIR, "competitors_audit.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print("\nCompetitor audit complete. Results saved to measurements/competitors_audit.json")

if __name__ == "__main__":
    run_competitor_audit()
