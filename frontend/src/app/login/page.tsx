"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { loginUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nextParam, setNextParam] = useState<string>("");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const n = new URLSearchParams(window.location.search).get("next");
      if (n) setNextParam(n);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginUser(username.trim(), password);
      const next = nextParam || "/";
      window.location.href = next;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-obsidian-surface rounded-2xl border border-obsidian-border p-8 shadow-2xl space-y-6">
        <div className="space-y-1.5">
          <div className="label-rust text-[10px] tracking-[0.22em] font-bold">
            PRIVATE SQUAD ACCESS
          </div>
          <h1 className="font-display text-3xl font-semibold text-white tracking-wide uppercase">
            Sign In
          </h1>
          <p className="text-xs text-slate-400 font-sans">
            {nextParam
              ? "Sign in to access this private tactical match dossier."
              : "Access your private CS2 match library, 2D replays, and teammate demos."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Username
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-obsidian-card border border-obsidian-border text-sm font-mono text-white focus:outline-none focus:border-rust"
              placeholder="e.g. ly1ssss"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-obsidian-card border border-obsidian-border text-sm font-mono text-white focus:outline-none focus:border-rust"
              placeholder="••••••••"
            />
          </div>

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
            <Lock className="w-3.5 h-3.5" />
            <span>{loading ? "Signing In..." : "Sign In"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </form>

        <div className="pt-4 border-t border-obsidian-border flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">New to the squad?</span>
          <Link
            href={nextParam ? `/register?next=${encodeURIComponent(nextParam)}` : "/register"}
            className="text-rust font-bold hover:underline"
          >
            Create Account →
          </Link>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-xl bg-obsidian-card border border-obsidian-border text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>
            Local-Scope uses standalone accounts and <strong>never</strong> asks for your Steam login or password.
          </span>
        </div>
      </div>
    </div>
  );
}
