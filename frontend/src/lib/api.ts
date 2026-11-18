import { MatchRow, MatchDetailResponse, HighlightRow, MistakeRow, IngestJobRow } from "./types";

const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.BACKEND_URL || "http://localhost:8000";
};

const getHeaders = (init?: HeadersInit): HeadersInit => {
  const token =
    process.env.NEXT_PUBLIC_API_TOKEN ||
    process.env.API_TOKEN;
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return {
    ...headers,
    ...init,
  };
};

export async function fetchMatches(limit = 50, offset = 0): Promise<MatchRow[]> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches?limit=${limit}&offset=${offset}`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch matches: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchMatchDetail(id: string): Promise<MatchDetailResponse> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches/${encodeURIComponent(id)}`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch match detail for ${id}: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchHighlights(
  matchId: string,
  steamid?: string
): Promise<HighlightRow[]> {
  const baseUrl = getBaseUrl();
  const url = new URL(`${baseUrl}/api/matches/${encodeURIComponent(matchId)}/highlights`, "http://localhost");
  if (steamid) url.searchParams.set("steamid", steamid);

  const res = await fetch(url.pathname + url.search, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch highlights: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchMistakes(
  matchId: string,
  steamid?: string
): Promise<MistakeRow[]> {
  const baseUrl = getBaseUrl();
  const url = new URL(`${baseUrl}/api/matches/${encodeURIComponent(matchId)}/mistakes`, "http://localhost");
  if (steamid) url.searchParams.set("steamid", steamid);

  const res = await fetch(url.pathname + url.search, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch mistakes: ${res.statusText}`);
  }
  return res.json();
}

export async function deleteMatch(id: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete match ${id}: ${res.statusText}`);
  }
}

export async function ingestSource(source: string): Promise<{ job_id: string }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/ingest`, {
    method: "POST",
    headers: getHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ source }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Ingest failed: ${res.statusText}`);
  }
  return res.json();
}

export async function uploadDemo(file: File): Promise<{ job_id: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/ingest/upload`, {
    method: "POST",
    headers: getHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Upload failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchReplay(matchId: string): Promise<any> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches/${encodeURIComponent(matchId)}/replay`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch replay for ${matchId}: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchJobStatus(jobId: string): Promise<IngestJobRow> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
    headers: getHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch job status: ${res.statusText}`);
  }
  return res.json();
}
