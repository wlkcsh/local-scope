"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { UserPlus, AlertCircle, ShieldCheck, KeyRound } from "lucide-react";
import { fetchAuthConfig, registerUser } from "@/lib/api";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [steamid, setSteamid] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAuthConfig()
      .then((cfg) => setInviteRequired(Boolean(cfg.invite_required)))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerUser({
        username: username.trim(),
        password,
        display_name: displayName.trim() || undefined,
        steamid: steamid.trim() || undefined,
        invite_code: inviteCode.trim() || undefined,
      });
      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-obsidian-surface rounded-2xl border border-obsidian-border p-8 shadow-2xl space-y-6">
        <div className="space-y-1.5">
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold">
            JOIN LOCAL-SCOPE
          </div>
          <h1 className="font-display text-3xl font-semibold text-white tracking-wide uppercase">
            Create Account
          </h1>
          <p className="text-xs text-slate-400 font-sans">
            Your matches stay private by default and automatically sync with teammates who played in the same demo.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                Username *
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-card border border-obsidian-border text-sm font-mono text-white focus:outline-none focus:border-rust"
                placeholder="ly1ssss"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-card border border-obsidian-border text-sm font-mono text-white focus:outline-none focus:border-rust"
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              Password * (min 6 chars)
            </label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-obsidian-card border border-obsidian-border text-sm font-mono text-white focus:outline-none focus:border-rust"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              Public SteamID64 (Optional)
            </label>
            <input
              type="text"
              value={steamid}
              onChange={(e) => setSteamid(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-obsidian-card border border-obsidian-border text-sm font-mono text-white focus:outline-none focus:border-rust"
              placeholder="76561198000000000"
            />
            <p className="text-[10px] text-slate-500 mt-1 leading-snug">
              Just your public 17-digit ID (never your Steam login!). Auto-unlocks demos uploaded by friends you played with.
            </p>
          </div>

          {inviteRequired && (
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-1 flex items-center gap-1">
                <KeyRound className="w-3 h-3" />
                Club Invite Code *
              </label>
              <input
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-card border border-amber-500/40 text-sm font-mono text-white focus:outline-none focus:border-rust"
                placeholder="Enter invite code from admin"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center gap-2 text-xs font-mono text-rose-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-rust hover:bg-rust-hover text-white font-mono font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{loading ? "Creating Account..." : "Create Account"}</span>
          </button>
        </form>

        <div className="pt-4 border-t border-obsidian-border flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">Already have an account?</span>
          <Link href="/login" className="text-rust font-bold hover:underline">
            Sign In →
          </Link>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-obsidian-card border border-obsidian-border text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>
            Zero Steam OAuth popups — we never ask for your Steam credentials.
          </span>
        </div>
      </div>
    </div>
  );
}
