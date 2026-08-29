import Link from "next/link";
import type { PublicProfile, SocialKey } from "@/types";

const SOCIAL_LABELS: Record<SocialKey, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  twitch: "Twitch",
  website: "Sitio web",
};

function initial(name: string): string {
  return name.charAt(0).toUpperCase() || "?";
}

// Public profile identity block: avatar, name, bio, current crowns and social links.
export function ProfileHeader({ profile }: { profile: PublicProfile }) {
  // ponytail: social values rendered as raw href; add handle→URL normalization when the profile-edit UI defines the format.
  const socials = Object.entries(profile.socials) as [SocialKey, string][];

  return (
    <div className="glass-panel rounded-xl p-8 flex flex-col items-center text-center gap-4 legendary-glow">
      {profile.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatarUrl}
          alt={profile.displayName}
          className="w-32 h-32 rounded-full object-cover border-4 border-tertiary"
        />
      ) : (
        <div className="w-32 h-32 rounded-full bg-surface-container flex items-center justify-center text-headline-lg font-headline-lg text-on-surface-variant border-4 border-tertiary">
          {initial(profile.displayName)}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-on-surface uppercase tracking-tight">
          {profile.displayName}
        </h1>
        <p className="text-label-caps font-label-caps text-primary/80">
          @{profile.username}
        </p>
      </div>

      {profile.currentReigns.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {profile.currentReigns.map((reign) => (
            <Link
              key={reign.titleSlug}
              href={`/t/${reign.titleSlug}`}
              className="inline-flex items-center gap-2 bg-tertiary/10 border border-tertiary/40 rounded-full px-4 py-1.5 hover:bg-tertiary/20 transition-colors"
            >
              <span className="text-xl">{reign.titleEmoji}</span>
              <span className="text-body-sm font-body-sm font-bold text-tertiary uppercase">
                {reign.titleName}
              </span>
            </Link>
          ))}
        </div>
      )}

      {profile.bio && (
        <p className="text-body-lg font-body-lg text-on-surface-variant italic max-w-md">
          {profile.bio}
        </p>
      )}

      {socials.length > 0 && (
        <div className="flex flex-wrap justify-center gap-4">
          {socials.map(([key, value]) => (
            <a
              key={key}
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
            >
              {SOCIAL_LABELS[key]}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
