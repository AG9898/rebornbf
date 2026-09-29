/**
 * Display-name rules (RESOLVED-68), mirroring `set_display_name` (M3-06A) so the name step can
 * reject a bad name before it reaches the database. The RPC stays the authority.
 */

export const DISPLAY_NAME_MAX = 32;

/** Postgres `[[:cntrl:]]`: C0 and C1 control characters and DEL. */
const CONTROL_CHARACTER = /\p{Cc}/u;

/** The name as the RPC stores it: surrounding whitespace trimmed. */
export function normalizeDisplayName(raw: string): string {
  return raw.trim();
}

/** Length in characters (code points), as Postgres `char_length` counts them. */
export function displayNameLength(raw: string): number {
  return [...normalizeDisplayName(raw)].length;
}

/** Why a name would be rejected, or null when it can be saved. */
export function displayNameProblem(raw: string): string | null {
  const length = displayNameLength(raw);
  if (length < 1) return "Enter a name.";
  if (length > DISPLAY_NAME_MAX) return `A name is at most ${DISPLAY_NAME_MAX} characters.`;
  if (CONTROL_CHARACTER.test(normalizeDisplayName(raw))) {
    return "A name may not contain control characters.";
  }
  return null;
}

/** The field's starting value: the OAuth name, cut to the limit; blank when there is none. */
export function initialDisplayName(profileName: string | null | undefined): string {
  if (!profileName) return "";
  const name = normalizeDisplayName(profileName).replace(/\p{Cc}/gu, "");
  return [...name].slice(0, DISPLAY_NAME_MAX).join("").trim();
}
