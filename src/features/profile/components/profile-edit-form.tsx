"use client";

import { useActionState } from "react";
import { updateProfileDetails } from "@/actions/profiles";
import type { Profile, SocialKey } from "@/types";

const INPUT_CLASS =
  "w-full px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors";

const SOCIAL_FIELDS: { key: SocialKey; label: string; placeholder: string }[] = [
  { key: "instagram", label: "INSTAGRAM", placeholder: "https://instagram.com/..." },
  { key: "tiktok", label: "TIKTOK", placeholder: "https://tiktok.com/@..." },
  { key: "youtube", label: "YOUTUBE", placeholder: "https://youtube.com/@..." },
  { key: "x", label: "X", placeholder: "https://x.com/..." },
  { key: "twitch", label: "TWITCH", placeholder: "https://twitch.tv/..." },
  { key: "website", label: "SITIO WEB", placeholder: "https://..." },
];

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-label-caps font-label-caps text-on-surface-variant"
    >
      {children}
    </label>
  );
}

// Edit form for the authenticated user's own profile: avatar, name, bio and social links.
export function ProfileEditForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateProfileDetails, null);

  return (
    <form action={action} className="glass-panel rounded-2xl p-8 flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={profile.display_name ?? profile.username}
            className="w-20 h-20 shrink-0 rounded-full object-cover border-2 border-tertiary"
          />
        ) : (
          <div className="w-20 h-20 shrink-0 rounded-full bg-surface-container flex items-center justify-center text-title-md font-title-md text-on-surface-variant border-2 border-tertiary">
            {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="avatar">AVATAR (JPG, PNG, WebP o GIF · máx 2 MB)</Label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="w-full text-body-sm font-body-sm text-on-surface-variant file:mr-3 file:rounded-lg file:border-0 file:bg-surface-container-high file:px-3 file:py-1.5 file:text-on-surface"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">NOMBRE</Label>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          maxLength={50}
          defaultValue={profile.display_name ?? ""}
          className={INPUT_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bio">BIO</Label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={280}
          defaultValue={profile.bio ?? ""}
          placeholder="Contá quién manda."
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={key}>{label}</Label>
            <input
              id={key}
              name={key}
              type="url"
              defaultValue={profile[key] ?? ""}
              placeholder={placeholder}
              className={INPUT_CLASS}
            />
          </div>
        ))}
      </div>

      {state?.success === false && state.error && (
        <p className="text-body-sm font-body-sm text-error">{state.error}</p>
      )}
      {state?.success === true && (
        <p className="text-body-sm font-body-sm text-tertiary">Guardado ✓</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-gradient px-6 py-3 rounded-lg text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest disabled:opacity-50 self-start"
      >
        {pending ? "GUARDANDO..." : "GUARDAR"}
      </button>
    </form>
  );
}
