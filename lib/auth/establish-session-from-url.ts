import type { Session, SupabaseClient } from "@supabase/supabase-js";

type EstablishSessionResult = {
  session: Session | null;
  error: string | null;
};

function parseHashParams(): URLSearchParams | null {
  if (typeof window === "undefined" || !window.location.hash) return null;

  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  return hash ? new URLSearchParams(hash) : null;
}

function clearUrlHash() {
  if (typeof window === "undefined") return;
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`
  );
}

/** Reads invite/magic-link tokens from the URL hash and stores the session. */
export async function establishSessionFromUrl(
  supabase: SupabaseClient
): Promise<EstablishSessionResult> {
  const hashParams = parseHashParams();

  if (hashParams) {
    const authError = hashParams.get("error");
    if (authError) {
      clearUrlHash();
      return {
        session: null,
        error:
          hashParams.get("error_description") ??
          hashParams.get("error_code") ??
          authError,
      };
    }

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      clearUrlHash();

      if (error) {
        return { session: null, error: error.message };
      }

      return { session: data.session, error: null };
    }
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { session, error: null };
}
