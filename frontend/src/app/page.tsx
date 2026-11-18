import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { fetchMatches, fetchMe } from "@/lib/api";
import { MatchRow, UserProfile } from "@/lib/types";
import { IngestForm } from "@/components/dashboard/IngestForm";
import { MatchCard } from "@/components/dashboard/MatchCard";
import { Footer } from "@/components/layout/Footer";
import {
  Crosshair,
  ShieldCheck,
  Lock,
  Users,
  LogIn,
  UserPlus,
  Radio,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MatchListPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let user: UserProfile | null = null;
  let matches: MatchRow[] = [];
  let errorMsg = null;

  try {
    user = await fetchMe(cookieHeader);
  } catch {
    user = null;
  }

  if (user) {
    try {
      matches = await fetchMatches(50, 0, cookieHeader);
    } catch (err: unknown) {
      console.error("Failed to fetch matches in RSC:", err);
      errorMsg = err instanceof Error ? err.message : "Failed to connect to Local-Scope backend";
    }
  }

  return (
    <div className="flex-1 flex flex-col justify-between">
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {user ? (
          <>
            {/* Authenticated Header & Ingest Section */}
            <section className="space-y-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="label-rust">SQUAD DOSSIER</span>
                  <span className="text-slate-600 font-mono text-xs">//</span>
                  <span className="text-[11px] font-mono text-slate-400 tracking-wider">
                    OPERATOR: {user.display_name.toUpperCase()}
                  </span>
                  {user.steamid && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-obsidian-card border border-obsidian-border text-emerald-400">
                      STEAMID: {user.steamid}
                    </span>
                  )}
                </div>
                <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight uppercase leading-none">
                  CS2 MATCH INTELLIGENCE
                </h1>
                <p className="text-sm text-slate-400 max-w-2xl font-sans leading-relaxed">
                  Automated tick-level telemetry parsing, mistake detection, and 60 FPS 2D radar replay reconstruction.
                </p>
              </div>

              <IngestForm />
            </section>

            {/* Authenticated Match History List */}
            <section className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-obsidian-border">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-rust" />
                  <h2 className="font-display text-xl text-white tracking-wide uppercase">
                    Your Match Dossiers
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-obsidian-card border border-obsidian-border text-[11px] font-mono text-slate-300">
                    {matches.length} {matches.length === 1 ? "MATCH" : "MATCHES"}
                  </span>
                </div>
                <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase hidden sm:inline">
                  OWNED + SQUAD PARTICIPATION
                </span>
              </div>

              {errorMsg && matches.length === 0 ? (
                <div className="p-8 rounded-2xl bg-obsidian-surface border border-obsidian-border text-center text-slate-400">
                  <p className="text-sm">{errorMsg}</p>
                </div>
              ) : matches.length === 0 ? (
                <div className="p-16 rounded-2xl bg-obsidian-surface border border-obsidian-border text-center">
                  <Crosshair className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-300">
                    No matches in your library yet
                  </h3>
                  <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto font-sans leading-relaxed">
                    Upload a .dem / .dem.gz file above or paste a FACEIT room URL. Any match uploaded by friends containing your linked SteamID64 will also appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {matches.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          /* Unauthenticated Squad Welcome Gate */
          <div className="space-y-12 py-8">
            <section className="relative overflow-hidden rounded-3xl bg-obsidian-surface border border-obsidian-border p-8 sm:p-12 lg:p-16 text-center space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rust-subtle border border-rust/30 text-xs font-mono font-semibold text-rust uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-rust" />
                <span>Private Squad Intelligence</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-white tracking-tight uppercase max-w-3xl mx-auto leading-tight">
                CS2 MATCH TELEMETRY & 2D RADAR REPLAY
              </h1>

              <p className="text-base text-slate-400 max-w-2xl mx-auto font-sans leading-relaxed">
                Zero third-party Steam logins. Keep your team&apos;s matches, mistakes, and sub-tick radar replays private to your squad.
              </p>

              <div className="flex items-center justify-center gap-4 pt-4 flex-wrap">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-rust hover:bg-rust-hover text-white font-mono font-bold text-xs tracking-wider uppercase transition-all shadow-lg shadow-rust/20 hover:scale-105 active:scale-95"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In to Squad</span>
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-obsidian-card hover:bg-obsidian-card-hover border border-obsidian-border hover:border-rust text-white font-mono font-semibold text-xs tracking-wider uppercase transition-colors"
                >
                  <UserPlus className="w-4 h-4 text-rust" />
                  <span>Create Account</span>
                </Link>
              </div>
            </section>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-obsidian-surface border border-obsidian-border space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg text-white tracking-wide uppercase">
                  Zero Steam Credentials
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Never enter your Steam password or connect third-party OAuth. Sign up with a simple username and password in seconds.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-obsidian-surface border border-obsidian-border space-y-3">
                <div className="w-10 h-10 rounded-xl bg-rust/10 border border-rust/30 flex items-center justify-center text-rust">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg text-white tracking-wide uppercase">
                  Teammate Auto-Sharing
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Optionally link your public 17-digit SteamID64. Any match uploaded by your teammates automatically unlocks in your library.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-obsidian-surface border border-obsidian-border space-y-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="font-display text-lg text-white tracking-wide uppercase">
                  60 FPS 2D Radar Replay
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Sub-tick positional traces, utility trajectories, flash blind durations, multi-kill windows, and first-bullet accuracy.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
