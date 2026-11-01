import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LiteSPM — The package manager for AI agents",
  description:
    "Find MCP servers, skills and plugins once, and install them into every coding agent you use. Browse 69k+ listings across 50 agent hosts — with publisher, source and installability stated up front.",
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
      { url: "/brand/icon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/brand/icon.svg",
  },
  openGraph: {
    title: "LiteSPM — The package manager for AI agents",
    description:
      "Search 69k+ MCP servers, skills and plugins, and install them into 50 supported agent hosts with preview, backup and undo.",
    siteName: "LiteSPM",
    type: "website",
  },
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
