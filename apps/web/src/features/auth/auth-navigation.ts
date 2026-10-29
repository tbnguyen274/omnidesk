const WORKSPACE_PATHS = new Set(["/", "/dashboard", "/user", "/dead-letter"]);
const LOCAL_ORIGIN = "https://omnidesk.invalid";

/** Accept only known workspace URLs; query strings and fragments stay intact. */
export function getLoginDestination(returnTo: string | null): string {
  if (
    !returnTo?.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("\\") ||
    [...returnTo].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x20 || code === 0x7f;
    })
  ) {
    return "/";
  }

  try {
    const target = new URL(returnTo, LOCAL_ORIGIN);
    if (target.origin !== LOCAL_ORIGIN || !WORKSPACE_PATHS.has(target.pathname)) {
      return "/";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

export function createLoginUrl(returnTo: string): string {
  const destination = getLoginDestination(returnTo);
  return destination === "/"
    ? "/login"
    : `/login?returnTo=${encodeURIComponent(destination)}`;
}
