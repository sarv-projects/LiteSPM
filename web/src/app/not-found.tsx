import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 text-sm font-medium text-brand-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight text-foreground">
            LiteSPM
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/marketplace" className="hover:text-foreground">Marketplace</Link>
            <Link href="/bundles" className="hover:text-foreground">Bundles</Link>
            <Link href="/agents" className="hover:text-foreground">Agents</Link>
            <Link href="/docs" className="hover:text-foreground">Docs</Link>
          </nav>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto flex flex-1 min-h-[60vh] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          We could not find that page.
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The link may be outdated, or the page may have moved.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link href="/marketplace" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
            Browse marketplace
          </Link>
          <Link href="/" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground">
            Return home
          </Link>
        </div>
      </main>
      <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
        LiteSPM — The Package Manager for AI Agents
      </footer>
    </div>
  );
}
