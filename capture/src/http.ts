export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

/** Constant-time bearer check. Hashing first gives both sides the same length. */
export async function bearerMatches(req: Request, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  const [a, b] = await Promise.all([sha256(m[1]!.trim()), sha256(secret)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export function intParam(v: string | null | undefined, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
