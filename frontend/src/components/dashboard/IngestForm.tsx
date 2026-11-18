"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, Link as LinkIcon, Loader2, CheckCircle2, AlertCircle, FileUp, ArrowRight } from "lucide-react";
import { ingestSource, uploadDemo, fetchJobStatus } from "@/lib/api";
import { IngestJobRow } from "@/lib/types";

export function IngestForm() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeJob, setActiveJob] = useState<IngestJobRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll active job status every 2s per SPEC §6
  useEffect(() => {
    if (!activeJob || activeJob.status === "done" || activeJob.status === "error") {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      return;
    }

    const poll = async () => {
      try {
        const job = await fetchJobStatus(activeJob.id);
        setActiveJob(job);

        if (job.status === "done" && job.match_id) {
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          setTimeout(() => {
            router.push(`/matches/${job.match_id}`);
          }, 1000);
        } else if (job.status === "error") {
          setError(job.error || "Ingestion pipeline encountered an error");
          setLoading(false);
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        }
      } catch (err: any) {
        console.error("Polling error:", err);
      }
    };

    pollingIntervalRef.current = setInterval(poll, 2000);
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    };
  }, [activeJob, router]);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl.trim()) return;

    setError(null);
    setLoading(true);
    try {
      const res = await ingestSource(sourceUrl.trim());
      setActiveJob({ id: res.job_id, status: "queued" });
    } catch (err: any) {
      setError(err.message || "Failed to trigger ingestion");
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const res = await uploadDemo(file);
      setActiveJob({ id: res.job_id, status: "queued" });
    } catch (err: any) {
      setError(err.message || "Failed to upload demo");
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  return (
    <div className="bg-obsidian-surface rounded-2xl border border-obsidian-border p-6 shadow-xl">
      <div className="flex flex-col gap-1 mb-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <LinkIcon className="w-5 h-5 text-rust" />
          Ingest CS2 Match Demo
        </h2>
        <p className="text-xs text-slate-400">
          Enter a FACEIT match room URL, raw match ID, or upload a .dem/.dem.gz file directly.
        </p>
      </div>

      {/* URL Input Form */}
      <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={loading}
            placeholder="https://www.faceit.com/en/cs2/room/1-..."
            className="w-full bg-obsidian-card border border-obsidian-border rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-rust transition-colors disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !sourceUrl.trim()}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-obsidian-subtle disabled:border disabled:border-obsidian-border disabled:text-slate-400 disabled:shadow-none bg-rust hover:bg-rust-hover text-white shadow-lg shadow-rust/20 active:scale-95 cursor-pointer"
        >
          {loading && activeJob?.status !== "done" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
          <span>{loading ? "Analyzing..." : "Analyze Match"}</span>
        </button>
      </form>

      {/* Drag & Drop File Upload Fallback */}
      <div className="mt-4">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
            dragActive
              ? "border-rust bg-rust-subtle"
              : "border-obsidian-border hover:border-rust bg-obsidian-subtle/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".dem,.dem.gz,.dem.zst"
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            className="hidden"
          />
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-mono">
            <FileUp className="w-4 h-4 text-slate-400" />
            <span>
              Or <span className="text-rust font-semibold underline">drag and drop</span> a local .dem / .dem.gz file here
            </span>
          </div>
        </div>
      </div>

      {/* Active Job Status / Progress */}
      {activeJob && (
        <div className="mt-4 p-4 rounded-xl bg-obsidian-subtle border border-obsidian-border">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2 font-medium">
              {activeJob.status === "done" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : activeJob.status === "error" ? (
                <AlertCircle className="w-4 h-4 text-rose-400" />
              ) : (
                <Loader2 className="w-4 h-4 text-rust animate-spin" />
              )}
              <span className="text-white font-semibold capitalize">
                {activeJob.status === "downloading"
                  ? "Streaming & Decompressing Demo..."
                  : activeJob.status === "parsing"
                  ? "Parsing Ticks & Extracting Telemetry..."
                  : activeJob.status === "done"
                  ? "Success! Loading Match Dashboard..."
                  : activeJob.status === "error"
                  ? "Analysis Failed"
                  : "Queued in Ingestion Worker..."}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Job: {activeJob.id.slice(0, 8)}
            </span>
          </div>

          {activeJob.status !== "done" && activeJob.status !== "error" && (
            <div className="w-full bg-surface-border h-1.5 rounded-full overflow-hidden mt-3">
              <div
                className={`h-full transition-all duration-500 ${
                  activeJob.status === "downloading"
                    ? "w-1/3 bg-blue-500"
                    : activeJob.status === "parsing"
                    ? "w-4/5 bg-amber-500"
                    : "w-1/6 bg-slate-500"
                }`}
              />
            </div>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
          <div className="flex items-center gap-2 font-semibold text-rose-200 mb-1.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>
              {error.includes("download scope missing")
                ? "FACEIT Demo Download Scope Missing"
                : "Ingestion Error"}
            </span>
          </div>

          {error.includes("download scope missing") ? (
            <div className="space-y-2 pl-6 text-slate-300">
              <p>
                Your FACEIT API key only has match data read permissions and lacks the restricted{" "}
                <code className="bg-surface px-1.5 py-0.5 rounded text-rose-300 font-mono">
                  download
                </code>{" "}
                OAuth scope required by FACEIT's private download cluster.
              </p>
              <p>
                👉 <strong>How to analyze this match:</strong> Download the demo directly from the FACEIT
                match page, then drag and drop the downloaded{" "}
                <code className="text-slate-200 font-mono">.dem</code>,{" "}
                <code className="text-slate-200 font-mono">.dem.gz</code>, or{" "}
                <code className="text-slate-200 font-mono">.dem.zst</code> file into the box above.
              </p>
            </div>
          ) : (
            <div className="pl-6 text-slate-300">{error}</div>
          )}
        </div>
      )}
    </div>
  );
}
