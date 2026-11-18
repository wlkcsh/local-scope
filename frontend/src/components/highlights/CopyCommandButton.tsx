"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyCommandButtonProps {
  startTick: number;
  playerName: string;
  className?: string;
}

export function CopyCommandButton({
  startTick,
  playerName,
  className = "",
}: CopyCommandButtonProps) {
  const [copied, setCopied] = useState(false);

  // Exact command string per SPEC §5.1:
  // demo_gototick {start_tick}; spec_player "{name}"; demo_resume
  const command = `demo_gototick ${startTick}; spec_player "${playerName}"; demo_resume`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy console command:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      title={`Copy: ${command}`}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded border transition-all ${
        copied
          ? "bg-emerald-950/80 border-emerald-500/60 text-emerald-400"
          : "bg-surface-subtle hover:bg-surface-hover border-surface-border text-slate-300 hover:text-white"
      } ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? "Copied!" : "Console Cmd"}</span>
    </button>
  );
}
