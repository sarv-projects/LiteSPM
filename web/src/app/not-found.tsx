import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        We could not find that page.
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The link may be outdated, or the page may have moved.
      </p>
      <Link href="/" className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
        Return to catalog
      </Link>
    </main>
  );
}
