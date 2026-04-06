/**
 * Shared proxy fetch helper.
 * Automatically attaches the Firebase ID token when available.
 * If ENFORCE_PROXY_AUTH is false on the server, the token is ignored there
 * but we still send it so the plumbing is in place.
 */
export async function proxyFetch(
  getIdToken: () => Promise<string | null>,
  body: { endpoint: string; payload: any }
): Promise<Response> {
  const token = await getIdToken();
  return fetch("/api/proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
