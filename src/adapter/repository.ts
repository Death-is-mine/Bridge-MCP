import { execSync } from "node:child_process";

export interface RepoStatus {
  branch: string;
  clean: boolean;
  ahead: number;
  behind: number;
  files: string[];
}

export function getStatus(cwd: string): RepoStatus {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8" }).trim();
    const status = execSync("git status --porcelain", { cwd, encoding: "utf-8" });
    const files = status.split("\n").filter(Boolean).map((l) => l.slice(3));
    const ahead = parseInt(execSync("git rev-list --count @{u}..HEAD 2>/dev/null || echo 0", { cwd, encoding: "utf-8" }).trim(), 10);
    const behind = parseInt(execSync("git rev-list --count HEAD..@{u} 2>/dev/null || echo 0", { cwd, encoding: "utf-8" }).trim(), 10);
    return { branch, clean: files.length === 0, ahead, behind, files };
  } catch {
    return { branch: "unknown", clean: true, ahead: 0, behind: 0, files: [] };
  }
}

export function getDiff(cwd: string): string {
  try {
    return execSync("git diff", { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}
