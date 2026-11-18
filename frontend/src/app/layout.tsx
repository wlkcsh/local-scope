import type { Metadata } from "next";
import Link from "next/link";
import { Bodoni_Moda, JetBrains_Mono, Inter } from "next/font/google";
import { Crosshair, Shield, Activity, Radio } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import "@/styles/globals.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LOCAL-SCOPE | CS2 Match Intelligence & 2D Radar Replay",
  description: "Tactical CS2 match intelligence dossier, telemetry analysis, and 60 FPS 2D radar replay engine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${bodoni.variable} ${jetbrainsMono.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('local-scope-theme');
                  if (theme === 'editorial') {
                    document.documentElement.classList.add('editorial');
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('editorial');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-obsidian-deep text-foreground font-sans min-h-screen flex flex-col relative selection:bg-rust selection:text-white">
        {/* SVG Grain Overlay */}
        <svg className="tactical-grain" xmlns="http://www.w3.org/2000/svg">
          <filter id="tactical-grain-filter">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.80"
              numOctaves="3"
              stitchTiles="stitch"
            />
            <feColorMatrix
              type="matrix"
              values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 1 0"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#tactical-grain-filter)" />
        </svg>

        {/* Editorial Masthead / Navigation */}
        <header className="sticky top-0 z-50 border-b border-obsidian-border bg-obsidian-surface/85 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface border border-obsidian-border text-rust group-hover:border-rust group-hover:text-white transition-all">
                <Crosshair className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-lg tracking-wider font-semibold text-white group-hover:text-rust transition-colors">
                    LOCAL<span className="text-rust">-SCOPE</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 font-medium tracking-widest uppercase">
                    // DOSSIER
                  </span>
                </div>
                <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-slate-400 -mt-0.5">
                  Tactical Match Intelligence
                </span>
              </div>
            </Link>

            {/* Perimeter Telemetry Badges & Theme Switcher */}
            <div className="flex items-center gap-3 text-xs">
              <ThemeToggle />
              <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-obsidian-card border border-obsidian-border font-mono text-[11px] text-slate-400">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>PARSER V1 // 8 HZ TRACKS</span>
              </div>
              <div className="hidden sm:flex items-center px-2.5 py-1 rounded-md bg-rust-subtle border border-rust/30 font-mono text-[10px] font-bold text-rust tracking-wider uppercase">
                64-TICK REPLAY
              </div>
            </div>
          </div>
        </header>

        {/* Main Content Stage */}
        <main className="flex-1 w-full flex flex-col min-h-0 relative z-10">
          {children}
        </main>
      </body>
    </html>
  );
}
