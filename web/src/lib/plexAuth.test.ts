import { describe, expect, it } from "vitest";
import { getPlexServerURLs, type BrowserPlexServer } from "./plexAuth";

describe("getPlexServerURLs", () => {
  it("keeps the preferred URL first and preserves every advertised fallback", () => {
    const server = {
      name: "Plex",
      clientIdentifier: "server-1",
      remoteURL: "https://unreachable.plex.direct:32400",
      localURL: "http://plex:32400",
      connectionURLs: [
        "https://unreachable.plex.direct:32400",
        "https://plex.example.com",
        "http://plex:32400",
      ],
      owned: true,
      hasRemoteURL: true,
      hasLocalURL: true,
    } as BrowserPlexServer;

    expect(getPlexServerURLs(server)).toEqual([
      "https://unreachable.plex.direct:32400",
      "https://plex.example.com",
      "http://plex:32400",
    ]);
  });
});
