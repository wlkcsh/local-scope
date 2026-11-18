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

  it("acquires upload token and routes uploadDemo directly to NEXT_PUBLIC_DIRECT_BACKEND_URL when configured", async () => {
    (globalThis as Record<string, unknown>).window = {};
    process.env.NEXT_PUBLIC_DIRECT_BACKEND_URL = "https://d6ulres4refvf.cloudfront.net///";

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/upload-token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ upload_token: "signed-upload-token-xyz" }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ job_id: "job-123" }),
      };
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const fakeFile = new File(["PBDE"], "match.dem", { type: "application/octet-stream" });
    const res = await uploadDemo(fakeFile);

    expect(res).toEqual({ job_id: "job-123" });
    expect(getUploadBaseUrl()).toBe("https://d6ulres4refvf.cloudfront.net");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = mockFetch.mock.calls[0];
    expect(tokenUrl).toBe("/api/auth/upload-token");
    expect(tokenInit.credentials).toBe("include");

    const [uploadUrl, uploadInit] = mockFetch.mock.calls[1];
    expect(uploadUrl).toBe("https://d6ulres4refvf.cloudfront.net/api/ingest/upload");
    expect(uploadInit.method).toBe("POST");
    expect(uploadInit.headers).toMatchObject({ Authorization: "Bearer signed-upload-token-xyz" });
    expect(uploadInit.credentials).toBe("omit");
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
