import { config } from "../core/config.js";

const TOKEN = config.github.token;
const API = "https://api.github.com";

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      ...(TOKEN ? { Authorization: `token ${TOKEN}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function isConfigured(): Promise<boolean> {
  if (!TOKEN) return false;
  try {
    await gh("/user");
    return true;
  } catch {
    return false;
  }
}

export async function createCommit(message: string, files: { path: string; content: string }[]): Promise<string> {
  const repo = config.github.repository;
  if (!repo) throw new Error("GITHUB_REPOSITORY not configured");

  const tree = await Promise.all(
    files.map(async (f) => {
      const blob = await gh<{ sha: string }>(`/repos/${repo}/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: Buffer.from(f.content).toString("base64"), encoding: "base64" }),
      });
      return { path: f.path, mode: "100644", type: "blob" as const, sha: blob.sha };
    }),
  );

  const main = await gh<{ sha: string; object: { sha: string } }>(`/repos/${repo}/git/ref/heads/main`);
  const currentCommit = await gh<{ tree: { sha: string } }>(`/repos/${repo}/git/commits/${main.object.sha}`);

  const newTree = await gh<{ sha: string }>(`/repos/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: currentCommit.tree.sha, tree }),
  });

  const commit = await gh<{ sha: string }>(`/repos/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: newTree.sha, parents: [main.object.sha] }),
  });

  await gh(`/repos/${repo}/git/refs/heads/main`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  });

  return commit.sha;
}

export async function createPr(title: string, body: string, head: string, base = "main"): Promise<{ number: number; url: string }> {
  const repo = config.github.repository;
  if (!repo) throw new Error("GITHUB_REPOSITORY not configured");
  return gh<{ number: number; html_url: string }>(`/repos/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  }).then((pr) => ({ number: pr.number, url: pr.html_url }));
}

export async function getPrReviews(prNumber: number): Promise<unknown[]> {
  const repo = config.github.repository;
  if (!repo) throw new Error("GITHUB_REPOSITORY not configured");
  return gh<unknown[]>(`/repos/${repo}/pulls/${prNumber}/reviews`);
}
