import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicSource, Track } from "../../apps/web/lib/music/types";
import { MusicUnavailableError } from "../../apps/web/lib/music/types";

const requireSession = vi.fn();
vi.mock("@/lib/session", () => ({
  requireSession: (r: Request) => requireSession(r),
}));

const source: MusicSource = { search: vi.fn(), track: vi.fn() };
vi.mock("@/lib/music", () => ({ getMusicSource: () => source }));

import { GET as search } from "../../apps/web/app/api/planner/music/search/route";
import { GET as trackRoute } from "../../apps/web/app/api/planner/music/[trackId]/route";

const track: Track = {
  id: "1",
  title: "T",
  artist: "A",
  licence: "CC BY 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  shareUrl: "https://www.jamendo.com/track/1",
  streamUrl: "https://example.test/1.mp3",
  duration: 10,
};

const searchReq = (qs: string) =>
  search(new Request(`http://localhost/api/planner/music/search${qs}`));
const trackReq = (id: string) =>
  trackRoute(new Request(`http://localhost/api/planner/music/${id}`), {
    params: Promise.resolve({ trackId: id }),
  });

describe("music route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    requireSession.mockResolvedValue({ session: { user: { id: "u" } } });
  });

  it("returns the envelope with a one-hour private cache header", async () => {
    vi.mocked(source.search).mockResolvedValue([track]);
    const res = await searchReq("?q=rain");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(await res.json()).toEqual({ data: [track] });

    vi.mocked(source.track).mockResolvedValue(track);
    const one = await trackReq("1");
    expect(one.status).toBe(200);
    expect(one.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(await one.json()).toEqual({ data: track });
  });

  it("trims and caps q, and splits and caps tags", async () => {
    vi.mocked(source.search).mockResolvedValue([]);
    const q = encodeURIComponent("  " + "x".repeat(150) + "  ");
    await searchReq(`?q=${q}&tags=a,b+c%20d,e,f,g`);
    expect(source.search).toHaveBeenCalledWith("x".repeat(100), [
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("answers 404 NOT_FOUND when the track is null or the id is non-numeric", async () => {
    vi.mocked(source.track).mockResolvedValue(null);
    const res = await trackReq("999");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");

    const bad = await trackReq("abc");
    expect(bad.status).toBe(404);
    expect(source.track).toHaveBeenCalledTimes(1);
  });

  it("answers 502 MUSIC_UNAVAILABLE on both routes", async () => {
    vi.mocked(source.search).mockRejectedValue(new MusicUnavailableError("down"));
    vi.mocked(source.track).mockRejectedValue(new MusicUnavailableError("down"));
    for (const res of [await searchReq("?q=rain"), await trackReq("1")]) {
      expect(res.status).toBe(502);
      expect((await res.json()).error.code).toBe("MUSIC_UNAVAILABLE");
    }
  });

  it("passes the 401 through without touching the source", async () => {
    const denied = Response.json(
      { error: { code: "UNAUTHENTICATED" } },
      { status: 401 }
    );
    requireSession.mockResolvedValue({ response: denied });
    expect((await searchReq("?q=rain")).status).toBe(401);
    expect((await trackReq("1")).status).toBe(401);
    expect(source.search).not.toHaveBeenCalled();
    expect(source.track).not.toHaveBeenCalled();
  });
});
