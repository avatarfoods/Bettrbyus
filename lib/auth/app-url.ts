export function getAppUrl(fallbackOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (fallbackOrigin) {
    return fallbackOrigin.replace(/\/$/, "");
  }

  return "http://localhost:3000";
}

export function getSetPasswordRedirectUrl(fallbackOrigin?: string): string {
  return `${getAppUrl(fallbackOrigin)}/set-password`;
}

export function getAuthCallbackRedirectUrl(
  nextPath: string,
  fallbackOrigin?: string
): string {
  return `${getAppUrl(fallbackOrigin)}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}
