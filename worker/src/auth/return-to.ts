import type { AuthEnv } from "./env.js";

export function safeReturnTo(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  const base = path.split("?")[0] ?? path;
  if (base === "/auth/status") return path;
  if (path.startsWith("/auth/")) return "/";
  return path;
}

export function isHomeAssetPath(path: string): boolean {
  const base = path.split("?")[0] ?? path;
  return base === "/" || base === "/index.html";
}

export function homeAssetUrl(env: AuthEnv): URL {
  return new URL("/", env.AUTH0_BASE_URL);
}
