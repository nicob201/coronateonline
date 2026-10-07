import type { Database } from "./database.types";

// Generic result type for server actions.
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Domain row types re-exported from the generated database types.
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Title = Database["public"]["Tables"]["titles"]["Row"];
export type Reign = Database["public"]["Tables"]["reigns"]["Row"];
export type CoinLedgerRow = Database["public"]["Tables"]["coin_ledger"]["Row"];

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
  priceFloor: number;
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
  message: string | null;
};

// A title's detail view: the card plus a resolved holder name and full past-reign history.
export type TitleDetail = TitleCard & {
  holderName: string | null;
  holderPaid: number | null;
  pastReigns: PastReign[];
  holderMessage: string | null;
  longestReigns: RankedReign[];
  priceHistory: number[];
  pricePeak: number;
};

// A coronation entry for the activity ticker.
export type Coronation = {
  id: string;
  pricePaid: number;
  titleName: string;
  titleEmoji: string;
  titleSlug: string;
  holderName: string;
  dethronedName: string | null;
};

// One reign (past or current) shown on a public profile.
export type ProfileReign = {
  titleName: string;
  titleEmoji: string;
  titleSlug: string;
  pricePaid: number;
  startedAt: string;
  endedAt: string | null;
  message: string | null;
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

// A ranked user in the Hall of Fame.
export type HallOfFameEntry = {
  username: string;
  name: string;
  avatarUrl: string | null;
  reignCount: number;
  latestTitleName: string;
};

// A ranked reign in the "longest reigns" leaderboard.
export type RankedReign = {
  id: string;
  holderName: string;
  durationLabel: string;
  pricePaid: number;
  isActive: boolean;
};

// A notice shown when a user was dethroned in the last 14 days.
export type DethroneNotice = {
  titleName: string;
  titleEmoji: string;
  titleSlug: string;
  byName: string;
  message: string | null;
  at: string;
};

// One wallet movement shown in the user's "Billetera", with its title and counterpart when it has a reign.
export type CoinMovement = Pick<CoinLedgerRow, "id" | "amount" | "reason" | "created_at"> & {
  titleName: string | null;
  counterpartName: string | null;
};

export type { Database };
