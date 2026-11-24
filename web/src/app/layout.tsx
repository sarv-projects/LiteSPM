import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import facts from "@/lib/litespm/site-facts.json";

const SHARE_DESCRIPTION = "Discover, preview, install and manage MCP servers, skills and plugins across supported AI coding agents. Local-first, reviewable, reversible.";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lite-spm-nine.vercel.app"),
  title: "LiteSPM — The package manager for AI agents",
  description: SHARE_DESCRIPTION,
  keywords: [
    "MCP",
    "Model Context Protocol",
    "agent skills",
    "SKILL.md",
    "plugins",
    "LiteSPM",
    "capability registry",
    "Claude Code",
    "Codex",
    "OpenCode",
  ],
  authors: [{ name: "LiteSPM" }],
  applicationName: "LiteSPM",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/brand/icon.svg",
  },
  openGraph: {
    title: "LiteSPM — The package manager for AI agents",
    description: SHARE_DESCRIPTION,
    siteName: "LiteSPM",
    type: "website",
    // The image comes from app/opengraph-image.tsx (generated from site facts).
  },
  twitter: {
    card: "summary_large_image",
    title: "LiteSPM — The package manager for AI agents",
    description: SHARE_DESCRIPTION,
  },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
