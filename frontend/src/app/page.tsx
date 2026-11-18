import React from "react";
import { fetchMatches } from "@/lib/api";
import { MatchRow } from "@/lib/types";
import { IngestForm } from "@/components/dashboard/IngestForm";
import { MatchCard } from "@/components/dashboard/MatchCard";
import { Footer } from "@/components/layout/Footer";
import { Crosshair, History, Flame, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MatchListPage() {
  let matches: MatchRow[] = [];
  let errorMsg = null;

  try {
    matches = await fetchMatches();
  } catch (err: any) {
    console.error("Failed to fetch matches in RSC:", err);
    errorMsg = err.message || "Failed to connect to Local-Scope backend";
  }

  return (
    <div className="flex-1 flex flex-col justify-between">
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Editorial Page Header & Ingest Stage */}
      <section className="space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="label-rust">TACTICAL DOSSIER</span>
            <span className="text-slate-600 font-mono text-xs">//</span>
            <span className="text-[11px] font-mono text-slate-400 tracking-wider">MR12 ENGINE</span>
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

      {/* Match History List */}
      <section className="space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-obsidian-border">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-rust" />
            <h2 className="font-display text-xl text-white tracking-wide uppercase">Analyzed Dossiers</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-obsidian-card border border-obsidian-border text-[11px] font-mono text-slate-300">
              {matches.length} {matches.length === 1 ? "MATCH" : "MATCHES"}
            </span>
          </div>
          <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase hidden sm:inline">
            ORDERED BY PLAYED_AT DESC
          </span>
        </div>

        {errorMsg && matches.length === 0 ? (
          <div className="p-8 rounded-2xl bg-obsidian-surface border border-obsidian-border text-center text-slate-400">
            <p className="text-sm">{errorMsg}</p>
            <p className="text-xs text-slate-500 mt-2 font-mono">
              Check backend service at http://127.0.0.1:8000
            </p>
          </div>
        ) : matches.length === 0 ? (
          <div className="p-16 rounded-2xl bg-obsidian-surface border border-obsidian-border text-center">
            <Crosshair className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-300">No matches ingested yet</h3>
            <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto font-sans leading-relaxed">
              Paste a FACEIT match room URL above or upload a .dem / .dem.gz file to generate full telemetry, mistake pins, and 2D replay.
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
      </div>
      <Footer />
    </div>
  );
}
