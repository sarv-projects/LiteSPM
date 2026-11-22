import json
import os
import time
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MEASUREMENTS_DIR = os.path.join(BASE_DIR, "measurements")

TARGETS = [
    {"url": "https://lite-spm-nine.vercel.app/", "name": "home"},
    {"url": "https://lite-spm-nine.vercel.app/marketplace", "name": "marketplace"},
    {"url": "https://lite-spm-nine.vercel.app/agent/cline", "name": "agent_cline"},
    {"url": "https://lite-spm-nine.vercel.app/package/mcp%3Abuiltin%3Amcp-registry%3Aio.github.github-github-mcp-server", "name": "package_detail"},
    {"url": "https://lite-spm-nine.vercel.app/bundles", "name": "bundles"},
    {"url": "https://lite-spm-nine.vercel.app/docs", "name": "docs"},
    {"url": "https://lite-spm-nine.vercel.app/compare", "name": "compare"}
]

A11Y_INSPECTION_JS = """() => {
    const issues = [];
    
    // 1. Images without alt
    document.querySelectorAll('img').forEach((img, i) => {
        if (!img.hasAttribute('alt') || img.getAttribute('alt').trim() === '') {
            issues.push({
                type: 'img_missing_alt',
                tag: img.outerHTML.slice(0, 100),
                severity: 'serious',
                help: 'Image missing alt attribute'
            });
        }
    });

    // 2. Buttons without accessible name
    document.querySelectorAll('button').forEach((btn, i) => {
        const text = btn.innerText.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const ariaLabelledby = btn.getAttribute('aria-labelledby');
        const title = btn.getAttribute('title');
        if (!text && !ariaLabel && !ariaLabelledby && !title) {
            issues.push({
                type: 'button_missing_name',
                tag: btn.outerHTML.slice(0, 120),
                severity: 'critical',
                help: 'Button has no accessible text name or aria-label'
            });
        }
    });

    // 3. Form fields without labels
    document.querySelectorAll('input, select, textarea').forEach((el) => {
        const id = el.id;
        const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false;
        const hasAria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
        const hasPlaceholder = el.getAttribute('placeholder');
        if (!hasLabel && !hasAria) {
            issues.push({
                type: 'input_missing_label',
                tag: el.outerHTML.slice(0, 100),
                severity: hasPlaceholder ? 'moderate' : 'critical',
                help: hasPlaceholder ? 'Input has placeholder but no associated label or aria-label' : 'Input has no label or aria-label'
            });
        }
    });

    // 4. Heading structure
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
        level: parseInt(h.tagName[1]),
        text: h.innerText.trim()
    }));
    
    let h1Count = headings.filter(h => h.level === 1).length;
    if (h1Count === 0) {
        issues.push({ type: 'no_h1', severity: 'serious', help: 'Page has no H1 element' });
    } else if (h1Count > 1) {
        issues.push({ type: 'multiple_h1', severity: 'moderate', count: h1Count, help: 'Page has more than one H1 element' });
    }

    // 5. Check landmarks
    const landmarks = {
        main: !!document.querySelector('main, [role="main"]'),
        nav: !!document.querySelector('nav, [role="navigation"]'),
        header: !!document.querySelector('header, [role="banner"]'),
        footer: !!document.querySelector('footer, [role="contentinfo"]')
    };

    return {
        issues: issues,
        headings: headings,
        landmarks: landmarks
    };
}"""

def run_a11y_audit():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        for target in TARGETS:
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            try:
                page.goto(target["url"], wait_until="networkidle", timeout=25000)
                data = page.evaluate(A11Y_INSPECTION_JS)
                results[target["name"]] = data
                print(f"[{target['name']}] Issues found: {len(data['issues'])}, Landmarks: {data['landmarks']}")
                for issue in data['issues'][:3]:
                    print(f"   -> {issue['type']}: {issue['help']} ({issue['severity']})")
            except Exception as e:
                results[target["name"]] = {"error": str(e)}
                print(f"[{target['name']}] Error: {e}")
            finally:
                page.close()
        browser.close()

    with open(os.path.join(MEASUREMENTS_DIR, "litespm_a11y_results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    run_a11y_audit()
