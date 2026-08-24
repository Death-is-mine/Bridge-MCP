import { resolve, relative } from "node:path";

export function validatePath(base: string, userPath: string): string | null {
  const resolved = resolve(base, userPath);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || rel.startsWith("/") || /^[A-Za-z]:/.test(rel)) {
    return null;
  }
  return resolved;
}

export function isPathSafe(base: string, userPath: string): boolean {
  return validatePath(base, userPath) !== null;
}
