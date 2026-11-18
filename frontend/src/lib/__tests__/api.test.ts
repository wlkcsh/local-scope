import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadDemo, fetchHighlights, fetchMistakes, getUploadBaseUrl } from "../api";

describe("API Client Hybrid Vercel + AWS Routing", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_DIRECT_BACKEND_URL;
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_API_TOKEN;
    delete process.env.API_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    // Clean up any simulated window
    if ("window" in globalThis) {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it("routes uploadDemo directly to NEXT_PUBLIC_DIRECT_BACKEND_URL when configured", async () => {
    (globalThis as Record<string, unknown>).window = {};
    process.env.NEXT_PUBLIC_DIRECT_BACKEND_URL = "https://51-20-19-230.sslip.io///";
    process.env.NEXT_PUBLIC_API_TOKEN = "club-secret";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: "job-123" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const fakeFile = new File(["PBDE"], "match.dem", { type: "application/octet-stream" });
    const res = await uploadDemo(fakeFile);

    expect(res).toEqual({ job_id: "job-123" });
    expect(getUploadBaseUrl()).toBe("https://51-20-19-230.sslip.io");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://51-20-19-230.sslip.io/api/ingest/upload");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer club-secret" });
  });

  it("falls back to same-origin /api/ingest/upload in browser when direct URL is unset", async () => {
    (globalThis as Record<string, unknown>).window = {};

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ job_id: "job-456" }),
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const fakeFile = new File(["PBDE"], "match.dem");
    await uploadDemo(fakeFile);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/ingest/upload");
  });

  it("preserves BACKEND_URL during SSR for fetchHighlights and fetchMistakes", async () => {
    process.env.BACKEND_URL = "https://51-20-19-230.sslip.io/";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    await fetchHighlights("match-1", "76561198000000001");
    await fetchMistakes("match-1", "76561198000000001");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://51-20-19-230.sslip.io/api/matches/match-1/highlights?steamid=76561198000000001"
    );
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://51-20-19-230.sslip.io/api/matches/match-1/mistakes?steamid=76561198000000001"
    );
  });
});
