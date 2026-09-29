/** Path prefixes that need a signed-in player. Later M3+ pages add their prefix here. */
export const PROTECTED_PATH_PREFIXES: readonly string[] = [
  "/account",
  "/units",
  "/squad",
  "/owner",
];

export const SIGN_IN_PATH = "/sign-in";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const DEFAULT_AFTER_SIGN_IN = "/account";

export const OAUTH_PROVIDERS = ["google", "discord"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Where to send a player after sign-in. Only same-origin absolute paths are kept, so a crafted
 * `next` parameter cannot turn the sign-in flow into an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (next === SIGN_IN_PATH || next.startsWith(`${SIGN_IN_PATH}?`)) return DEFAULT_AFTER_SIGN_IN;
  return next;
}

/** The sign-in URL (path + query) a signed-out visitor to `pathname` is redirected to. */
export function signInRedirectPath(pathname: string, search: string): string {
  const params = new URLSearchParams({ next: `${pathname}${search}` });
  return `${SIGN_IN_PATH}?${params.toString()}`;
}
