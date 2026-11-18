import React from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { fetchReplay } from "@/lib/api";
import { ReplayPlayer } from "@/components/replay/ReplayPlayer";

interface ReplayPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string; tick?: string }>;
}

export const dynamic = "force-dynamic";

export default async function ReplayViewerPage({
  params,
  searchParams,
}: ReplayPageProps) {
  const { id } = await params;
  const { round = "1", tick } = await searchParams;

  let replay = null;
  let errorMsg = null;

  try {
    replay = await fetchReplay(id);
  } catch (err: any) {
    console.error(`Replay page failed to fetch replay for ${id}:`, err);
    errorMsg = err.message || "Failed to load replay file from backend";
  }

  const roundNum = parseInt(round, 10) || 1;
  const initialTick = tick ? parseInt(tick, 10) : undefined;

  if (errorMsg || !replay) {
    return (
      <div className="p-8 rounded-2xl bg-surface border border-surface-border text-center space-y-4 max-w-lg mx-auto my-12">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-white">Replay Data Unavailable</h2>
        <p className="text-xs text-slate-400">
          {errorMsg || `Replay for match ${id} could not be loaded.`}
        </p>
        <div>
          <Link
            href={`/matches/${id}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cs2-ct text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Match Overview</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ReplayPlayer
      replay={replay}
      initialRound={roundNum}
      initialTick={initialTick}
    />
  );
}
