import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJamendoSource,
  licenceLabel,
} from "../../apps/web/lib/music/jamendo";
import { MusicUnavailableError } from "../../apps/web/lib/music/types";

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/jamendo/${name}.json`, import.meta.url), "utf8");

const jsonResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "application/json" } });

describe("Jamendo adapter (story 11.1)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const source = createJamendoSource("test-client");

  it("normalises a search response and ANDs tags with +", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(fixture("tracks-search")));
    vi.stubGlobal("fetch", fetchMock);

    const tracks = await source.search("rain", ["lofi", "chillout"]);

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toEqual({
      id: "1532771",
      title: "Rainy Window",
      artist: "Example Artist",
      licence: "CC BY-NC-SA 3.0",
      licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
      shareUrl: "https://www.jamendo.com/track/1532771",
      streamUrl:
        "https://prod-1.storage.jamendo.com/?trackid=1532771&format=mp31&from=app-example",
      duration: 142,
    });
    expect(tracks[1].id).toBe("1532772");

    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.host).toBe("api.jamendo.com");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("search")).toBe("rain");
    expect(url.searchParams.get("tags")).toBe("lofi chillout");
    expect(url.search).toContain("tags=lofi+chillout");
  });

  it("returns one track by id and null for an unknown id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(fixture("tracks-search"))));
    expect((await source.track("1532771"))?.title).toBe("Rainy Window");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(fixture("tracks-empty"))));
    expect(await source.track("999")).toBeNull();
  });

  it.each([
    ["fetch rejects", () => Promise.reject(new TypeError("network down"))],
    ["non-2xx", () => Promise.resolve(jsonResponse("{}", 503))],
    ["malformed JSON", () => Promise.resolve(jsonResponse("<html>oops"))],
    ["Jamendo error header", () => Promise.resolve(jsonResponse(fixture("tracks-error")))],
    [
      "track missing fields",
      () =>
        Promise.resolve(
          jsonResponse(
            JSON.stringify({
              headers: { status: "success", code: 0 },
              results: [{ id: "1" }],
            })
          )
        ),
    ],
  ])("throws MusicUnavailableError when %s", async (_name, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    await expect(source.search("rain", [])).rejects.toBeInstanceOf(MusicUnavailableError);
    await expect(source.track("1")).rejects.toBeInstanceOf(MusicUnavailableError);
  });

  it("treats an empty audio url as unusable", async () => {
    const body = JSON.parse(fixture("tracks-search"));
    body.results = [{ ...body.results[0], audio: "" }];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(JSON.stringify(body))));
    await expect(source.track("1532771")).rejects.toBeInstanceOf(MusicUnavailableError);
  });

  it("returns null when no result has the requested id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(fixture("tracks-search"))));
    expect(await source.track("42")).toBeNull();
  });

  it("labels CC0 as CC0 1.0", () => {
    expect(licenceLabel("https://creativecommons.org/publicdomain/zero/1.0/")).toBe("CC0 1.0");
  });

  it("labels licences from the Creative Commons URL", () => {
    expect(licenceLabel("https://creativecommons.org/licenses/by/4.0/")).toBe("CC BY 4.0");
    expect(licenceLabel("https://example.com/other")).toBe("Creative Commons");
  });
});
