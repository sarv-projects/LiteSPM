import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import facts from "@/lib/litespm/site-facts.json";

const LISTINGS = `${Math.floor(facts.listings / 1000)}k+`;
const SHARE_DESCRIPTION = `Search ${LISTINGS} MCP servers, skills and plugins, and install them into ${facts.hosts} supported agent hosts with preview, backup and undo.`;

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
  description: `Find MCP servers, skills and plugins once, and install them into the coding agents you use. Browse ${LISTINGS} listings across ${facts.hosts} agent hosts (${facts.remoteHosts} remote-capable) — with publisher, source and installability stated up front.`,
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
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "LiteSPM — The package manager for AI agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LiteSPM — The package manager for AI agents",
    description: SHARE_DESCRIPTION,
    images: ["/og.png"],
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
