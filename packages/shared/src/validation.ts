// Input validation for safe parameter handling

// Git ref pattern: alphanumeric, dots, hyphens, underscores, slashes only
const GIT_REF_RE = /^[a-zA-Z0-9._\-\/]+$/;

// Repository path: no null bytes, no traversal
const REPO_PATH_RE = /^[a-zA-Z0-9._\-\/\\: ]+$/;

/**
 * Validate a git ref (branch, tag, commit hash).
 * Rejects shell metacharacters and injection attempts.
 */
export function isValidGitRef(ref: string): boolean {
  if (!ref || ref.length > 256) return false;
  return GIT_REF_RE.test(ref);
}

/**
 * Validate a repository path.
 * Rejects null bytes and obviously malicious paths.
 */
export function isValidRepoPath(path: string): boolean {
  if (!path || path.length > 1024) return false;
  if (path.includes("\0")) return false;
  return REPO_PATH_RE.test(path);
}

/**
 * Validate a worker name.
 */
export function isValidWorkerName(name: string): boolean {
  if (!name || name.length > 128) return false;
  return /^[a-zA-Z0-9 _\-\.]+$/.test(name);
}

/**
 * Validate a session ID (UUID format).
 */
export function isValidSessionId(id: string): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Validate an approval ID.
 */
export function isValidApprovalId(id: string): boolean {
  if (!id) return false;
  return /^apr_[a-zA-Z0-9]+$/.test(id);
}

/**
 * Sanitize a string for safe display (no control characters).
 */
export function sanitizeForDisplay(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

/**
 * Validate a prompt string (non-empty, reasonable length).
 */
export function isValidPrompt(prompt: string): boolean {
  if (!prompt || prompt.length === 0) return false;
  if (prompt.length > 100_000) return false;
  return true;
}
