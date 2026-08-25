import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const GIT_REF_RE = /^[a-zA-Z0-9._\-\/]+$/;
const TIMEOUT = 30_000;

export class RepositoryManager {
  private allowedPaths: string[];

  constructor(allowedPaths: string[]) {
    this.allowedPaths = allowedPaths.map((p) => resolve(p));
  }

  validateAccess(repoPath: string): boolean {
    const resolved = resolve(repoPath);
    return this.allowedPaths.some((allowed) => resolved.startsWith(allowed));
  }

  getStatus(repoPath: string): { branch: string; clean: boolean; files: string[] } {
    if (!this.validateAccess(repoPath)) throw new Error("Repository not in allowed list");
    try {
      const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: repoPath, encoding: "utf-8", timeout: TIMEOUT,
      }).trim();
      const status = execFileSync("git", ["status", "--porcelain"], {
        cwd: repoPath, encoding: "utf-8", timeout: TIMEOUT,
      });
      const files = status.split("\n").filter(Boolean).map((l) => l.slice(3));
      return { branch, clean: files.length === 0, files };
    } catch {
      return { branch: "unknown", clean: true, files: [] };
    }
  }

  getDiff(repoPath: string, ref?: string): string {
    if (!this.validateAccess(repoPath)) throw new Error("Repository not in allowed list");
    if (ref && !GIT_REF_RE.test(ref)) throw new Error("Invalid git ref");
    try {
      const args = ref ? ["diff", ref] : ["diff"];
      return execFileSync("git", args, { cwd: repoPath, encoding: "utf-8", timeout: TIMEOUT });
    } catch {
      return "";
    }
  }

  getFiles(repoPath: string, pattern?: string): string[] {
    if (!this.validateAccess(repoPath)) throw new Error("Repository not in allowed list");
    try {
      const args = pattern ? ["ls-files", pattern] : ["ls-files"];
      const output = execFileSync("git", args, { cwd: repoPath, encoding: "utf-8", timeout: TIMEOUT });
      return output.split("\n").filter(Boolean);
    } catch {
      return this.walkSync(repoPath, repoPath);
    }
  }

  private walkSync(dir: string, base: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      const full = join(dir, e.name);
      const rel = relative(base, full).replace(/\\/g, "/");
      if (e.isDirectory()) out.push(...this.walkSync(full, base));
      else out.push(rel);
    }
    return out;
  }
}
