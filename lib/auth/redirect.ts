export const POST_LOGIN_PATH = "/movings/new";

export function resolvePostLoginPath(next?: string | null): string {
  if (!next || !next.startsWith("/") || next === "/") {
    return POST_LOGIN_PATH;
  }
  return next;
}
