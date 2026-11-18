import React from "react";
import { notFound } from "next/navigation";
import { fetchMatchDetail } from "@/lib/api";
import { ScoreHeader } from "@/components/dashboard/ScoreHeader";
import { PlayerSelect } from "@/components/dashboard/PlayerSelect";
import { Scoreboard } from "@/components/dashboard/Scoreboard";
import { MechanicsPanel } from "@/components/dashboard/MechanicsPanel";
import { RoundTimeline } from "@/components/dashboard/RoundTimeline";
import { MatchInsights } from "@/components/dashboard/MatchInsights";
import { HighlightReel } from "@/components/highlights/HighlightReel";
import { MistakeMap } from "@/components/mistakes/MistakeMap";
import { MistakeList } from "@/components/mistakes/MistakeList";
import { Footer } from "@/components/layout/Footer";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ player?: string }>;
}

export const dynamic = "force-dynamic";

export default async function MatchDashboardPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  let detail;
  try {
    detail = await fetchMatchDetail(id);
  } catch (err) {
    console.error(`Error loading match ${id}:`, err);
    notFound();
  }

  const { match, player_stats, highlights, mistakes, rounds } = detail;

  // Determine focused player: URL query param -> my_steamid -> first player
  const requestedSteamid = resolvedSearchParams.player;
  const focusedPlayer =
    player_stats.find((p) => p.steamid === requestedSteamid) ||
    player_stats.find((p) => p.steamid === match.my_steamid) ||
    player_stats[0];

  const focusedSteamid = focusedPlayer?.steamid || null;

  return (
    <div className="flex-1 flex flex-col justify-between">
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* 1. ScoreHeader */}
      <ScoreHeader match={match} />

      {/* 2. RoundTimeline */}
      <RoundTimeline
        matchId={match.id}
        roundsTotal={match.rounds_total}
        scoreA={match.score_a}
        scoreB={match.score_b}
        rounds={rounds}
        teamAName={match.team_a_name}
        teamBName={match.team_b_name}
      />

      {/* 3. MatchInsights (MVP Spotlight, Honors, Key Moments & Team Macro) */}
      <MatchInsights
        matchId={match.id}
        playerStats={player_stats}
        roundsTotal={match.rounds_total}
        highlights={highlights}
        mistakes={mistakes}
        focusedSteamid={focusedSteamid}
        teamAName={match.team_a_name}
        teamBName={match.team_b_name}
      />

      {/* 4. PlayerSelect */}
      <PlayerSelect
        playerStats={player_stats}
        selectedSteamid={focusedSteamid || ""}
        teamAName={match.team_a_name}
        teamBName={match.team_b_name}
      />

      {/* 4. Scoreboard */}
      <Scoreboard
        playerStats={player_stats}
        selectedSteamid={focusedSteamid}
        teamAName={match.team_a_name}
        teamBName={match.team_b_name}
        scoreA={match.score_a}
        scoreB={match.score_b}
      />

      {/* 5. MechanicsPanel (Telemetry for focused player) */}
      {focusedPlayer && <MechanicsPanel stats={focusedPlayer} />}

      {/* 6. Mistakes Section: Radar Map + List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7">
          <MistakeMap
            mapName={match.map}
            mistakes={mistakes}
            playerStats={player_stats}
            focusedSteamid={focusedSteamid}
          />
        </div>
        <div className="lg:col-span-5">
          <MistakeList
            mistakes={mistakes}
            playerStats={player_stats}
            focusedSteamid={focusedSteamid}
          />
        </div>
      </div>

      {/* 7. HighlightReel */}
      <HighlightReel
        highlights={highlights}
        playerStats={player_stats}
        demoUrl={match.demo_url}
        focusedSteamid={focusedSteamid}
      />
      </div>
      <Footer />
    </div>
  );
}
