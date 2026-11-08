const ROLES = [
  { slug: "plebeyo", label: "Plebeyo" },
  { slug: "bufon", label: "Bufón" },
  { slug: "vasallo", label: "Vasallo" },
  { slug: "escudero", label: "Escudero" },
  { slug: "juglar", label: "Juglar" },
  { slug: "paje", label: "Paje" },
  { slug: "campesino", label: "Campesino" },
  { slug: "lacayo", label: "Lacayo" },
  { slug: "cortesano", label: "Cortesano" },
  { slug: "aspirante", label: "Aspirante" },
] as const;

const FLAVORS = [
  "sin corona",
  "de paso",
  "sin reino",
  "con ganas de trono",
  "en ascenso",
  "de turno",
  "sin castillo",
  "con delirios de grandeza",
] as const;

export type GuestIdentity = { username: string; displayName: string };

export const GUEST_ENTRY_ERROR = "No pudimos crear tu usuario invitado. Probá de nuevo en un rato.";

// Builds a random courtly guest identity, e.g. bufon_0427 / "Bufón sin corona #0427".
export function guestIdentity(random: () => number = Math.random): GuestIdentity {
  const role = ROLES[Math.floor(random() * ROLES.length)];
  const flavor = FLAVORS[Math.floor(random() * FLAVORS.length)];
  const number = String(Math.floor(random() * 10000)).padStart(4, "0");
  return {
    username: `${role.slug}_${number}`,
    displayName: `${role.label} ${flavor} #${number}`,
  };
}

// Returns `next` if it is a same-origin relative path, else the fallback (blocks `//evil.com`, `/\evil.com`).
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}
