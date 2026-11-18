import {
  MatchRow,
  MatchDetailResponse,
  HighlightRow,
  MistakeRow,
  IngestJobRow,
  UserProfile,
} from "./types";

const stripTrailingSlash = (url: string): string => url.trim().replace(/\/+$/, "");

const getBaseUrl = (): string => {
  if (typeof window !== "undefined") {
    return "";
  }
  return stripTrailingSlash(process.env.BACKEND_URL || "http://localhost:8000");
};

export const getUploadBaseUrl = (): string => {
  const direct = process.env.NEXT_PUBLIC_DIRECT_BACKEND_URL?.trim();
  if (direct) {
    return stripTrailingSlash(direct);
  }
  return getBaseUrl();
};

const getHeaders = (
  init?: Record<string, string>,
  cookieHeader?: string,
  overrideBearerToken?: string
): Record<string, string> => {
  const token =
    overrideBearerToken ||
    process.env.NEXT_PUBLIC_API_TOKEN ||
    process.env.API_TOKEN;
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (cookieHeader && typeof window === "undefined") {
    headers["Cookie"] = cookieHeader;
  }
  return {
    ...headers,
    ...init,
  };
};

// ==========================================
// Authentication & User Profile API
// ==========================================

export async function fetchAuthConfig(cookieHeader?: string): Promise<{ invite_required: boolean }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/config`, {
    headers: getHeaders(undefined, cookieHeader),
    cache: "no-store",
  });
  if (!res.ok) {
    return { invite_required: false };
  }
  return res.json();
}

export async function fetchMe(cookieHeader?: string): Promise<UserProfile | null> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: getHeaders(undefined, cookieHeader),
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.statusText}`);
  }
  return res.json();
}

export async function loginUser(username: string, password: string): Promise<UserProfile> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Invalid username or password");
  }
  return res.json();
}

export async function registerUser(payload: {
  username: string;
  password: string;
  display_name?: string;
  steamid?: string;
  invite_code?: string;
}): Promise<UserProfile> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Registration failed");
  }
  return res.json();
}

export async function logoutUser(): Promise<void> {
  const baseUrl = getBaseUrl();
  await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function updateUserProfile(payload: {
  display_name?: string;
  steamid?: string;
}): Promise<UserProfile> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update profile");
  }
  return res.json();
}

// ==========================================
// Matches, Telemetry & Replay API
// ==========================================

export async function fetchMatches(
  limit = 50,
  offset = 0,
  cookieHeader?: string
): Promise<MatchRow[]> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches?limit=${limit}&offset=${offset}`, {
    headers: getHeaders(undefined, cookieHeader),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch matches: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchMatchDetail(
  id: string,
  cookieHeader?: string
): Promise<MatchDetailResponse> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches/${encodeURIComponent(id)}`, {
    headers: getHeaders(undefined, cookieHeader),
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch match detail for ${id}: ${res.statusText}`);
  }
  return res.json();
}

export async function toggleMatchVisibility(
  matchId: string,
  isPublic: boolean
): Promise<{ id: string; is_public: boolean }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches/${encodeURIComponent(matchId)}/visibility`, {
    method: "PATCH",
    headers: getHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ is_public: isPublic }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update match sharing settings");
  }
  return res.json();
}

export async function fetchHighlights(
  matchId: string,
  steamid?: string,
  cookieHeader?: string
): Promise<HighlightRow[]> {
  const baseUrl = getBaseUrl();
  const params = new URLSearchParams();
  if (steamid) params.set("steamid", steamid);
  const query = params.toString();

  const res = await fetch(
    `${baseUrl}/api/matches/${encodeURIComponent(matchId)}/highlights${query ? `?${query}` : ""}`,
    {
      headers: getHeaders(undefined, cookieHeader),
      credentials: "include",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch highlights: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchMistakes(
  matchId: string,
  steamid?: string,
  cookieHeader?: string
): Promise<MistakeRow[]> {
  const baseUrl = getBaseUrl();
  const params = new URLSearchParams();
  if (steamid) params.set("steamid", steamid);
  const query = params.toString();

  const res = await fetch(
    `${baseUrl}/api/matches/${encodeURIComponent(matchId)}/mistakes${query ? `?${query}` : ""}`,
    {
      headers: getHeaders(undefined, cookieHeader),
      credentials: "include",
      cache: "no-store",
    }
  );
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
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to delete match ${id}: ${res.statusText}`);
  }
}

export async function ingestSource(source: string): Promise<{ job_id: string }> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/ingest`, {
    method: "POST",
    headers: getHeaders({
      "Content-Type": "application/json",
    }),
    credentials: "include",
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

  const uploadBaseUrl = getUploadBaseUrl();
  const isCrossOriginUpload = Boolean(process.env.NEXT_PUBLIC_DIRECT_BACKEND_URL?.trim());

  let uploadToken: string | undefined;
  if (isCrossOriginUpload) {
    // Obtain a short-lived 5-minute upload token via same-origin session cookie
    // so direct CloudFront uploads stay authenticated without long-lived client tokens.
    const tokenRes = await fetch(`${getBaseUrl()}/api/auth/upload-token`, {
      method: "POST",
      credentials: "include",
    });
    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      uploadToken = tokenData.upload_token;
    } else if (tokenRes.status === 401) {
      throw new Error("Please sign in to upload match demos");
    }
  }

  const res = await fetch(`${uploadBaseUrl}/api/ingest/upload`, {
    method: "POST",
    headers: getHeaders(undefined, undefined, uploadToken),
    credentials: isCrossOriginUpload ? "omit" : "include",
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Upload failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchReplay(matchId: string, cookieHeader?: string): Promise<any> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/matches/${encodeURIComponent(matchId)}/replay`, {
    headers: getHeaders(undefined, cookieHeader),
    credentials: "include",
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
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch job status: ${res.statusText}`);
  }
  return res.json();
}
