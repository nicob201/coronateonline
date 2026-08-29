import { describe, expect, it } from "vitest";
import { socialUrl } from "../socials";

describe("socialUrl", () => {
  it("returns a full URL unchanged", () => {
    expect(socialUrl("instagram", "https://instagram.com/nico")).toBe(
      "https://instagram.com/nico",
    );
  });

  it("strips leading @ from a bare handle", () => {
    expect(socialUrl("tiktok", "@juanita")).toBe("https://www.tiktok.com/@juanita");
  });

  it("prepends the platform base to a bare handle", () => {
    expect(socialUrl("x", "nico")).toBe("https://x.com/nico");
  });

  it("handles youtube with @ prefix", () => {
    expect(socialUrl("youtube", "@mychannel")).toBe("https://www.youtube.com/@mychannel");
  });

  it("handles twitch bare handle", () => {
    expect(socialUrl("twitch", "streamer")).toBe("https://www.twitch.tv/streamer");
  });

  it("prefixes https:// for website without scheme", () => {
    expect(socialUrl("website", "nico.dev")).toBe("https://nico.dev");
  });

  it("keeps http:// website URLs unchanged", () => {
    expect(socialUrl("website", "http://old.dev")).toBe("http://old.dev");
  });

  it("strips leading slash", () => {
    expect(socialUrl("instagram", "/nico")).toBe("https://instagram.com/nico");
  });
});
