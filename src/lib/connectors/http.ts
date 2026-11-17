/** Small shared helpers: safe JSON fetching, narrowing and HTML stripping. */

export const REQUEST_TIMEOUT_MS = 15_000;

export type Json = Record<string, unknown>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function rec(value: unknown): Json {
  return isRecord(value) ? value : {};
}

/** GET/POST JSON. Throws HttpError with a short, credential-free message. */
export async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    throw new HttpError(0, name === "TimeoutError" || name === "AbortError" ? "request timed out" : "network error");
  }
  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403
        ? "authentication or permission problem"
        : res.status === 404
          ? "not found (check the configuration)"
          : res.status === 429
            ? "rate limited"
            : "request failed";
    throw new HttpError(res.status, `HTTP ${res.status}: ${hint}`);
  }
  if (res.status === 204) return {};
  try {
    return await res.json();
  } catch {
    throw new HttpError(res.status, "response was not valid JSON");
  }
}

/** Convert any thrown value into a short message that cannot contain a credential. */
export function errorDetail(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  return "unexpected error while contacting the service";
}

export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Strip HTML to readable plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function newerOf(a: string | undefined, b: string): string {
  return !a || b > a ? b : a;
}
