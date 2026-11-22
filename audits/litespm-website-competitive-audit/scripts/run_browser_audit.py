import os
import sys
import json
import time
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCREENSHOTS_DIR = os.path.join(BASE_DIR, "screenshots")
MEASUREMENTS_DIR = os.path.join(BASE_DIR, "measurements")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(MEASUREMENTS_DIR, exist_ok=True)

LITESPM_URL = "https://lite-spm-nine.vercel.app"

VIEWPORTS = [
    {"name": "mobile_320", "width": 320, "height": 640},
    {"name": "mobile_375", "width": 375, "height": 667},
    {"name": "tablet_768", "width": 768, "height": 1024},
    {"name": "desktop_1024", "width": 1024, "height": 768},
    {"name": "desktop_1440", "width": 1440, "height": 900},
    {"name": "desktop_1920", "width": 1920, "height": 1080},
]

def audit_litespm(playwright):
    browser = playwright.chromium.launch(headless=True, channel="chrome")
    results = {
        "routes": {},
        "console_errors": [],
        "console_warnings": [],
        "failed_requests": [],
        "performance": {},
        "interactions": {}
    }

    # 1. Test Viewports on Home Page
    print("Testing LiteSPM Homepage across viewports...")
    for vp in VIEWPORTS:
        context = browser.new_context(viewport={"width": vp["width"], "height": vp["height"]})
        page = context.new_page()
        t0 = time.time()
        resp = page.goto(LITESPM_URL, wait_until="networkidle", timeout=30000)
        t_load = time.time() - t0
        
        screenshot_path = os.path.join(SCREENSHOTS_DIR, f"litespm_home_{vp['name']}.png")
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"  {vp['name']} captured ({t_load:.2f}s, status {resp.status}) -> {screenshot_path}")
        context.close()

    # 2. In-depth audit of core routes
    core_routes = [
        {"path": "/", "name": "home"},
        {"path": "/marketplace", "name": "marketplace"},
        {"path": "/bundles", "name": "bundles"},
        {"path": "/agents", "name": "agents"},
        {"path": "/agent/cline", "name": "agent_cline"},
        {"path": "/package/mcp-server-git", "name": "package_detail"},
        {"path": "/compare", "name": "compare"},
        {"path": "/docs", "name": "docs"},
        {"path": "/insights", "name": "insights"},
        {"path": "/publish", "name": "publish"},
        {"path": "/nonexistent-route-test-404", "name": "not_found"},
    ]

    print("\nAuditing Core Routes...")
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()

    def handle_console(msg):
        if msg.type == "error":
            results["console_errors"].append({"text": msg.text, "location": msg.location})
        elif msg.type == "warning":
            results["console_warnings"].append({"text": msg.text, "location": msg.location})

    def handle_req_failed(req):
        results["failed_requests"].append({"url": req.url, "failure": req.failure})

    page.on("console", handle_console)
    page.on("requestfailed", handle_req_failed)

    for route in core_routes:
        url = LITESPM_URL + route["path"]
        print(f"Navigating to {url}...")
        t0 = time.time()
        try:
            resp = page.goto(url, wait_until="networkidle", timeout=25000)
            status = resp.status if resp else None
            timing = page.evaluate("() => JSON.stringify(window.performance.timing)")
            metrics = page.evaluate("""() => {
                const entries = performance.getEntriesByType('navigation');
                const nav = entries.length ? entries[0] : null;
                const paint = performance.getEntriesByType('paint');
                let fcp = null;
                paint.forEach(p => { if (p.name === 'first-contentful-paint') fcp = p.startTime; });
                return {
                    nav: nav ? {
                        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
                        loadEvent: nav.loadEventEnd - nav.startTime,
                        responseEnd: nav.responseEnd - nav.startTime,
                        transferSize: nav.transferSize,
                        encodedBodySize: nav.encodedBodySize
                    } : null,
                    fcp: fcp
                };
            }""")
            
            title = page.title()
            heading = page.evaluate("() => document.querySelector('h1')?.innerText || ''")
            
            # Screenshot
            shot_file = os.path.join(SCREENSHOTS_DIR, f"litespm_{route['name']}_1440.png")
            page.screenshot(path=shot_file, full_page=True)
            
            # Check meta tags
            meta_desc = page.evaluate("() => document.querySelector('meta[name=\"description\"]')?.content || ''")
            og_title = page.evaluate("() => document.querySelector('meta[property=\"og:title\"]')?.content || ''")
            
            results["routes"][route["path"]] = {
                "name": route["name"],
                "status": status,
                "title": title,
                "h1": heading,
                "meta_description": meta_desc,
                "og_title": og_title,
                "metrics": metrics,
                "duration_s": time.time() - t0,
                "screenshot": shot_file
            }
            print(f"  [{status}] '{title}' | H1: '{heading[:40]}' | FCP: {metrics.get('fcp')}ms")
        except Exception as e:
            print(f"  Error loading {url}: {e}")
            results["routes"][route["path"]] = {"error": str(e)}

    # 3. Test interactive behaviors on marketplace
    print("\nTesting interactive behaviors on /marketplace...")
    page.goto(LITESPM_URL + "/marketplace", wait_until="networkidle")
    
    # Check tabs
    tabs = page.evaluate("""() => {
        const btns = Array.from(document.querySelectorAll('button, [role=\"tab\"]'));
        return btns.map(b => ({ text: b.innerText.trim(), role: b.getAttribute('role') }))
                   .filter(b => b.text.includes('MCP') || b.text.includes('Skill') || b.text.includes('Plugin') || b.text.includes('Installed'));
    }""")
    print(f"  Marketplace tabs found: {tabs}")
    results["interactions"]["tabs"] = tabs

    # Test Search Input
    search_input = page.query_selector('input[type="search"], input[placeholder*="search" i], input[placeholder*="find" i], input[type="text"]')
    if search_input:
        search_input.fill("github")
        time.sleep(1.0)
        shot_search = os.path.join(SCREENSHOTS_DIR, "litespm_search_query_github.png")
        page.screenshot(path=shot_search)
        results["interactions"]["search_github_tested"] = True
        print("  Search filled with 'github' and captured")

    # Save measurements
    with open(os.path.join(MEASUREMENTS_DIR, "litespm_audit_results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    browser.close()
    return results

if __name__ == "__main__":
    with sync_playwright() as p:
        audit_litespm(p)
