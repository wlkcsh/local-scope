"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, LogOut, ShieldCheck, Check, AlertCircle, LogIn } from "lucide-react";
import { fetchMe, logoutUser, updateUserProfile } from "@/lib/api";
import { UserProfile } from "@/lib/types";

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [steamid, setSteamid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((u) => {
        if (!active) return;
        setUser(u);
        if (u) {
          setSteamid(u.steamid || "");
          setDisplayName(u.display_name || "");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const updated = await updateUserProfile({
        display_name: displayName.trim(),
        steamid: steamid.trim(),
      });
      setUser(updated);
      setSteamid(updated.steamid || "");
      setDisplayName(updated.display_name || "");
      setSaveMsg("Saved! Refreshing matches...");
      router.refresh();
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (err: unknown) {
      setSaveErr(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setOpen(false);
    router.push("/login");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="w-20 h-8 rounded-lg bg-obsidian-card border border-obsidian-border animate-pulse" />
    );
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-card border border-obsidian-border hover:border-rust text-xs font-mono font-semibold text-white transition-colors"
      >
        <LogIn className="w-3.5 h-3.5 text-rust" />
        <span>SIGN IN</span>
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-obsidian-card border text-xs font-mono transition-colors cursor-pointer ${
          open ? "border-rust text-white" : "border-obsidian-border hover:border-obsidian-border-hover text-slate-200"
        }`}
      >
        <span className="w-5 h-5 rounded-full bg-rust-subtle border border-rust/40 flex items-center justify-center text-[10px] font-bold text-rust uppercase">
          {user.display_name.slice(0, 2)}
        </span>
        <span className="max-w-[96px] truncate font-semibold text-white">
          {user.display_name}
        </span>
      </button>

      {open && (
        <div className="tactical-select-menu absolute right-0 mt-2 w-80 rounded-xl bg-obsidian-surface border border-obsidian-border-hover shadow-2xl p-4 z-50 space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-obsidian-border">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">
                {user.display_name}
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                @{user.username} {user.is_admin ? "· ADMIN" : ""}
              </div>
            </div>
            <User className="w-4 h-4 text-rust flex-shrink-0" />
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-3">
            <div>
              <label
                htmlFor="profile-display-name"
                className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1"
              >
                Display Name
              </label>
              <input
                id="profile-display-name"
                name="name"
                type="text"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian-card border border-obsidian-border text-xs font-mono text-white focus:outline-none focus:border-rust"
                placeholder="Your handle"
              />
            </div>

            <div>
              <label
                htmlFor="profile-steamid"
                className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1"
              >
                Public SteamID64 (Optional)
              </label>
              <input
                id="profile-steamid"
                name="steamid"
                type="text"
                autoComplete="off"
                inputMode="numeric"
                value={steamid}
                onChange={(e) => setSteamid(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian-card border border-obsidian-border text-xs font-mono text-white focus:outline-none focus:border-rust"
                placeholder="76561198000000000"
              />
              <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                Public read-only ID. Matches your friends upload containing this SteamID automatically appear in your library.
              </p>
            </div>

            {saveErr && (
              <div className="flex items-center gap-1.5 text-[11px] text-rose-400 font-mono">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{saveErr}</span>
              </div>
            )}

            {saveMsg && (
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
                <Check className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{saveMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-1.5 px-3 rounded-lg bg-rust hover:bg-rust-hover text-white text-xs font-mono font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
          </form>

          <div className="pt-2.5 border-t border-obsidian-border flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Private Session
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs font-mono text-rose-400 hover:underline cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
