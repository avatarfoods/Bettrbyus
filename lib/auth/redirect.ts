/**
 * Where signing in lands you. "/" is the app launcher, so a plain login now
 * shows the tile grid rather than dropping straight into one app - the whole
 * point of the launcher is that no single app is the default.
 *
 * A "next" path is still honoured, so a deep link the user was sent to before
 * being bounced to login still works.
 */
export const POST_LOGIN_PATH = "/";

export function resolvePostLoginPath(next?: string | null): string {
  if (!next || !next.startsWith("/")) {
    return POST_LOGIN_PATH;
  }
  return next;
}
