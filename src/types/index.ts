import type { Database } from "./database.types";

// Generic result type for server actions.
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Domain row types re-exported from the generated database types.
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Title = Database["public"]["Tables"]["titles"]["Row"];
export type Reign = Database["public"]["Tables"]["reigns"]["Row"];
export type Claim = Database["public"]["Tables"]["claims"]["Row"];

// Cosmetic rarity tier derived from a title's current price.
export type Rarity = "legendario" | "epico" | "comun";

// Public subset of a profile shown as a title's holder.
export type TitleHolder = Pick<Profile, "username" | "display_name" | "avatar_url">;

// A title with its current holder, price and rarity derived from the active reign.
export type TitleCard = Pick<
  Title,
  "id" | "slug" | "name" | "emoji" | "description" | "created_at"
> & {
  holder: TitleHolder | null;
  holderUserId: string | null;
  price: number | null;
  reignStartedAt: string | null;
  rarity: Rarity;
};

// A past reign shown in a title's throne history.
export type PastReign = {
  id: string;
  holderName: string;
  pricePaid: number;
  startedAt: string;
  endedAt: string | null;
};

// A title's detail view: the card plus a resolved holder name and full past-reign history.
export type TitleDetail = TitleCard & {
  holderName: string | null;
  pastReigns: PastReign[];
};

// A coronation entry for the activity ticker.
export type Coronation = {
  id: string;
  pricePaid: number;
  titleName: string;
  titleEmoji: string;
  titleSlug: string;
  holderName: string;
};

// One reign (past or current) shown on a public profile.
export type ProfileReign = {
  titleName: string;
  titleEmoji: string;
  titleSlug: string;
  pricePaid: number;
  startedAt: string;
  endedAt: string | null;
};

// Social platform keys that can appear on a public profile.
export type SocialKey = "instagram" | "tiktok" | "youtube" | "x" | "twitch" | "website";

// A public shareable profile: identity, non-null socials, and reign history.
export type PublicProfile = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  socials: Partial<Record<SocialKey, string>>;
  currentReigns: ProfileReign[];
  pastReigns: ProfileReign[];
};

// A pending claim shown in the admin queue.
export type PendingClaimListItem = {
  id: string;
  amount: number;
  createdAt: string;
  claimantName: string;
  titleName: string;
  titleSlug: string;
};

// A ranked user in the Hall of Fame.
export type HallOfFameEntry = {
  username: string;
  name: string;
  avatarUrl: string | null;
  reignCount: number;
  latestTitleName: string;
};

export type { Database };
