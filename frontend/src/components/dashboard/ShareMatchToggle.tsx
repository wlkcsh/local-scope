"use client";

import React, { useState } from "react";
import { Lock, Globe, Copy, Check } from "lucide-react";
import { toggleMatchVisibility } from "@/lib/api";

interface ShareMatchToggleProps {
  matchId: string;
  initialIsPublic: boolean;
}

export function ShareMatchToggle({ matchId, initialIsPublic }: ShareMatchToggleProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleToggle = async () => {
    setBusy(true);
    try {
      const res = await toggleMatchVisibility(matchId, !isPublic);
      setIsPublic(res.is_public);
    } catch (err) {
      console.error("Failed to toggle match visibility:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/matches/${matchId}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={handleToggle}
        title={
          isPublic
            ? "Anyone with this link can view this match — click to make private"
            : "Private (only you and match participants can view) — click to share link"
        }
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 ${
          isPublic
            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
            : "bg-obsidian-card border-obsidian-border text-slate-300 hover:border-rust"
        }`}
      >
        {isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
        <span>{isPublic ? "Shared Link" : "Private"}</span>
      </button>

      {isPublic && (
        <button
          type="button"
          onClick={handleCopyLink}
          title="Copy shareable match URL"
          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-obsidian-card border border-obsidian-border hover:border-rust text-[11px] font-mono text-slate-300 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Copy</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
