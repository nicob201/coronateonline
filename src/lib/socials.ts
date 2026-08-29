import type { SocialKey } from "@/types";

const BASES: Record<SocialKey, string> = {
  instagram: "https://instagram.com/",
  tiktok: "https://www.tiktok.com/@",
  youtube: "https://www.youtube.com/@",
  x: "https://x.com/",
  twitch: "https://www.twitch.tv/",
  website: "https://",
};

// Turns a handle or URL into a canonical profile URL for the given platform.
export function socialUrl(key: SocialKey, value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  const cleaned = value.replace(/^@+/, "").replace(/^\/+/, "");
  return `${BASES[key]}${cleaned}`;
}
