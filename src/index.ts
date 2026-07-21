import { page } from "./page";

interface Env { GITHUB_TOKEN?: string }

type GithubRepo = {
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  default_branch: string;
  archived: boolean;
  fork: boolean;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  subscribers_count: number;
  updated_at: string;
  pushed_at: string | null;
  created_at: string;
  license: { spdx_id: string; name: string } | null;
  topics: string[];
  owner: { login: string; avatar_url: string; html_url: string };
};

type CommunityProfile = {
  health_percentage: number | null;
  files: {
    code_of_conduct: string | null;
    contributing: string | null;
    issue_template: string | null;
    license: string | null;
    readme: string | null;
  };
};

type Signal = { label: string; state: "strong" | "watch" | "risk"; detail: string; evidence: string };
type DecisionState = "proceed" | "review" | "block";
type Decision = {
  state: DecisionState;
  label: string;
  rationale: string;
  evidenceCoverage: number;
  nextSteps: { state: "strong" | "watch" | "risk"; action: string; evidence: string }[];
};
type GithubCommit = { sha: string; html_url: string; commit: { author: { date: string } | null } };

type Assessment = {
  repository: string;
  url: string;
  owner: { login: string; avatarUrl: string; url: string };
  summary: string;
  score: number;
  grade: string;
  assessedAt: string;
  dimensions: { name: string; score: number; max: number; rationale: string }[];
  signals: Signal[];
  decision: Decision;
  integrationReceipt: { repository: string; branch: string; commit: { sha: string; url: string; authoredAt: string | null } | null; issuedAt: string };
  facts: { stars: number; forks: number; openIssues: number; lastPush: string | null; license: string; topics: string[] };
  evidence: { label: string; url: string }[];
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
const GITHUB_HEADERS = { accept: "application/vnd.github+json", "user-agent": "ProofScope-OpenSource-Diligence" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });
}

function normalizeRepository(input: string): string | null {
  const clean = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/$/, "");
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(clean) ? clean : null;
}

function daysSince(date: string | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000));
}

function dateLabel(date: string | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(date));
}

async function github<T>(path: string, token?: string): Promise<{ data: T | null; response: Response }> {
  const url = `https://api.github.com${path}`;
  const cache = await caches.open("proofscope-github-v2");
  const cached = await cache.match(url);
  if (cached) return { data: await cached.clone().json() as T, response: cached };
  const headers = token ? { ...GITHUB_HEADERS, authorization: `Bearer ${token}` } : GITHUB_HEADERS;
  const response = await fetch(url, { headers });
  if (response.ok) {
    const cacheResponse = new Response(response.clone().body, response);
    cacheResponse.headers.set("cache-control", "public, s-maxage=900");
    await cache.put(url, cacheResponse.clone());
  }
  if (!response.ok) return { data: null, response };
  return { data: await response.json() as T, response };
}

function gradeFor(score: number): string {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

function decisionFor(
  repo: GithubRepo,
  activity: number,
  documentation: number,
  security: number,
  maintenance: number,
  release: number,
  hasSecurity: boolean,
  latestRelease: { published_at: string } | null,
  score: number
): Decision {
  const coverage = [activity > 0, documentation > 0, security > 0, maintenance > 0, release > 0].filter(Boolean).length;
  const nextSteps: Decision["nextSteps"] = [];
  if (repo.archived) nextSteps.push({ state: "risk", action: "Do not select an archived repository for a new production dependency.", evidence: repo.html_url });
  if (!repo.license) nextSteps.push({ state: "risk", action: "Resolve the license before redistribution or production adoption.", evidence: repo.html_url });
  if (!hasSecurity) nextSteps.push({ state: "watch", action: "Confirm the maintainer's vulnerability-reporting path before integration.", evidence: `${repo.html_url}/security` });
  if (activity < 19) nextSteps.push({ state: "watch", action: "Verify current maintenance ownership and pin an explicit commit before rollout.", evidence: `${repo.html_url}/commits/${repo.default_branch}` });
  if (!latestRelease) nextSteps.push({ state: "watch", action: "Pin a reviewed commit and define an upgrade owner because no release was found.", evidence: `${repo.html_url}/releases` });
  if (repo.open_issues_count > 100) nextSteps.push({ state: "watch", action: "Review the unresolved issue backlog for failures relevant to your integration.", evidence: `${repo.html_url}/issues` });
  if (!nextSteps.length) nextSteps.push({ state: "strong", action: "Pin the reviewed release and retain these evidence links in the integration record.", evidence: `${repo.html_url}/releases` });

  const block = repo.archived || !repo.license || (security < 7 && activity <= 5);
  const proceed = !block && score >= 85 && security >= 14 && activity >= 19 && release >= 10;
  const state: DecisionState = block ? "block" : proceed ? "proceed" : "review";
  const label = state === "proceed" ? "Proceed with evidence" : state === "block" ? "Block pending resolution" : "Review before integration";
  const rationale = state === "proceed"
    ? "Core delivery, security, maintenance, and release signals meet the defined evidence threshold."
    : state === "block"
      ? "A production adoption blocker was found in the public evidence."
      : "Public evidence is useful but incomplete or mixed; complete the listed checks before adoption.";
  return { state, label, rationale, evidenceCoverage: Math.round((coverage / 5) * 100), nextSteps };
}

export function buildAssessment(repo: GithubRepo, community: CommunityProfile | null, hasSecurity: boolean, latestRelease: { published_at: string } | null, latestCommit: GithubCommit | null = null): Assessment {
  const pushedDays = daysSince(repo.pushed_at);
  const releaseDays = daysSince(latestRelease?.published_at ?? null);
  const activity = repo.archived ? 0 : pushedDays === null ? 4 : pushedDays <= 30 ? 25 : pushedDays <= 90 ? 19 : pushedDays <= 180 ? 12 : 5;
  const docsFiles = community?.files;
  const documentation = Math.min(20, (docsFiles?.readme ? 8 : 0) + (docsFiles?.contributing ? 5 : 0) + (docsFiles?.issue_template ? 3 : 0) + (docsFiles?.code_of_conduct ? 2 : 0) + (repo.homepage ? 2 : 0));
  const security = Math.min(20, (hasSecurity ? 10 : 0) + (repo.license ? 4 : 0) + ((community?.health_percentage ?? 0) >= 75 ? 6 : (community?.health_percentage ?? 0) >= 50 ? 3 : 0));
  const maintenance = Math.min(20, (repo.open_issues_count <= 30 ? 7 : repo.open_issues_count <= 100 ? 4 : 1) + (repo.topics.length >= 3 ? 4 : repo.topics.length ? 2 : 0) + (repo.description ? 3 : 0) + (!repo.fork ? 3 : 0) + (repo.stargazers_count >= 50 ? 3 : repo.stargazers_count >= 5 ? 2 : 1));
  const release = Math.min(15, latestRelease ? (releaseDays !== null && releaseDays <= 120 ? 15 : releaseDays !== null && releaseDays <= 365 ? 10 : 5) : 0);
  const score = activity + documentation + security + maintenance + release;
  const issueState: Signal["state"] = repo.open_issues_count > 100 ? "risk" : repo.open_issues_count > 30 ? "watch" : "strong";
  const signals: Signal[] = [
    { label: "Recent delivery", state: activity >= 19 ? "strong" : activity >= 10 ? "watch" : "risk", detail: repo.archived ? "Repository is archived." : pushedDays === null ? "No push timestamp is available." : `Last push ${pushedDays} day${pushedDays === 1 ? "" : "s"} ago.`, evidence: `${repo.html_url}/commits/${repo.default_branch}` },
    { label: "Security posture", state: security >= 14 ? "strong" : security >= 7 ? "watch" : "risk", detail: `${hasSecurity ? "Security policy found" : "No SECURITY.md found"}; community health ${community?.health_percentage ?? "not reported"}%.`, evidence: `${repo.html_url}/security` },
    { label: "Documentation", state: documentation >= 15 ? "strong" : documentation >= 8 ? "watch" : "risk", detail: `${docsFiles?.readme ? "README" : "No README"}${docsFiles?.contributing ? ", CONTRIBUTING" : ""}${docsFiles?.issue_template ? ", issue templates" : ""}${docsFiles?.code_of_conduct ? ", code of conduct" : ""}.`, evidence: `${repo.html_url}` },
    { label: "Issue load", state: issueState, detail: `${repo.open_issues_count.toLocaleString()} open issues reported by GitHub.`, evidence: `${repo.html_url}/issues` },
    { label: "Release cadence", state: release >= 10 ? "strong" : release > 0 ? "watch" : "risk", detail: latestRelease ? `Latest release published ${dateLabel(latestRelease.published_at)}.` : "No GitHub release was found.", evidence: `${repo.html_url}/releases` }
  ];
  const decision = decisionFor(repo, activity, documentation, security, maintenance, release, hasSecurity, latestRelease, score);
  return {
    repository: repo.full_name,
    url: repo.html_url,
    owner: { login: repo.owner.login, avatarUrl: repo.owner.avatar_url, url: repo.owner.html_url },
    summary: repo.description || "No repository description provided.",
    score,
    grade: gradeFor(score),
    assessedAt: new Date().toISOString(),
    dimensions: [
      { name: "Activity", score: activity, max: 25, rationale: repo.archived ? "Archived repository" : pushedDays === null ? "No push data" : `Last push ${pushedDays} days ago` },
      { name: "Documentation", score: documentation, max: 20, rationale: `${docsFiles?.readme ? "README present" : "README missing"}; community files assessed` },
      { name: "Security", score: security, max: 20, rationale: `${hasSecurity ? "Security policy found" : "Security policy missing"}` },
      { name: "Maintenance", score: maintenance, max: 20, rationale: `${repo.open_issues_count} open issues; ${repo.topics.length} topics` },
      { name: "Release", score: release, max: 15, rationale: latestRelease ? `Latest release ${dateLabel(latestRelease.published_at)}` : "No release found" }
    ],
    signals,
    decision,
    integrationReceipt: { repository: repo.full_name, branch: repo.default_branch, commit: latestCommit ? { sha: latestCommit.sha, url: latestCommit.html_url, authoredAt: latestCommit.commit.author?.date || null } : null, issuedAt: new Date().toISOString() },
    facts: { stars: repo.stargazers_count, forks: repo.forks_count, openIssues: repo.open_issues_count, lastPush: repo.pushed_at, license: repo.license?.spdx_id || "No license", topics: repo.topics },
    evidence: [
      { label: "Repository", url: repo.html_url },
      { label: "Commits", url: `${repo.html_url}/commits/${repo.default_branch}` },
      { label: "Issues", url: `${repo.html_url}/issues` },
      { label: "Releases", url: `${repo.html_url}/releases` },
      { label: "Security", url: `${repo.html_url}/security` }
    ]
  };
}

async function assess(repositoryInput: string, token?: string): Promise<Assessment> {
  const repository = normalizeRepository(repositoryInput);
  if (!repository) throw new Error("Use a public GitHub repository in owner/repo format.");
  const [repoResult, communityResult, securityResult, releaseResult, commitResult] = await Promise.all([
    github<GithubRepo>(`/repos/${repository}`, token),
    github<CommunityProfile>(`/repos/${repository}/community/profile`, token),
    github<unknown>(`/repos/${repository}/contents/SECURITY.md`, token),
    github<{ published_at: string }>(`/repos/${repository}/releases/latest`, token),
    github<GithubCommit>(`/repos/${repository}/commits/HEAD`, token)
  ]);
  if (repoResult.response.status === 404) throw new Error("Repository not found or it is not public.");
  if (repoResult.response.status === 403) throw new Error("GitHub rate limit reached. Try again in a few minutes.");
  if (!repoResult.data) throw new Error(`GitHub returned ${repoResult.response.status}.`);
  return buildAssessment(repoResult.data, communityResult.data, securityResult.response.ok, releaseResult.data, commitResult.data);
}

async function compare(repositories: string[], token?: string): Promise<{ reports: Assessment[]; ranking: { rank: number; repository: string; score: number; grade: string; decision: DecisionState }[] }> {
  if (repositories.length < 2 || repositories.length > 4) throw new Error("Provide two to four public repositories to compare.");
  const reports = await Promise.all(repositories.map((repository) => assess(repository, token)));
  const ranking = reports.slice().sort((a, b) => b.score - a.score).map((report, index) => ({ rank: index + 1, repository: report.repository, score: report.score, grade: report.grade, decision: report.decision.state }));
  return { reports, ranking };
}

function mcpResponse(id: unknown, result: unknown): Response {
  return json({ jsonrpc: "2.0", id: id ?? null, result });
}

async function handleMcp(request: Request, token?: string): Promise<Response> {
  let body: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try { body = await request.json(); } catch { return json({ jsonrpc: "2.0", error: { code: -32700, message: "Invalid JSON-RPC request." } }, 400); }
  if (body.method === "initialize") return mcpResponse(body.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "ProofScope", version: "1.0.0" } });
  if (body.method === "tools/list") return mcpResponse(body.id, { tools: [
    { name: "assess_repository", description: "Produce an evidence-backed health and release-risk report for a public GitHub repository.", inputSchema: { type: "object", properties: { repository: { type: "string", description: "Public GitHub repository in owner/repo format." } }, required: ["repository"] } },
    { name: "compare_repositories", description: "Compare two to four public GitHub repositories using the same transparent scoring model.", inputSchema: { type: "object", properties: { repositories: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, required: ["repositories"] } },
    { name: "assess_integration_risk", description: "Turn public repository evidence into a deterministic proceed, review, or block decision with linked verification steps for an AI agent.", inputSchema: { type: "object", properties: { repository: { type: "string", description: "Public GitHub repository in owner/repo format." }, intended_use: { type: "string", description: "Optional integration context such as runtime dependency, build tool, or plugin." } }, required: ["repository"] } }
  ] });
  if (body.method === "tools/call") {
    const name = body.params?.name;
    const args = (body.params?.arguments || {}) as Record<string, unknown>;
    try {
      if (name === "assess_repository") {
        const report = await assess(String(args.repository || ""), token);
        return mcpResponse(body.id, { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] });
      }
      if (name === "compare_repositories") {
        const repositories = Array.isArray(args.repositories) ? args.repositories.map(String) : [];
        return mcpResponse(body.id, { content: [{ type: "text", text: JSON.stringify(await compare(repositories, token), null, 2) }] });
      }
      if (name === "assess_integration_risk") {
        const report = await assess(String(args.repository || ""), token);
        return mcpResponse(body.id, { content: [{ type: "text", text: JSON.stringify({ intendedUse: String(args.intended_use || "general integration"), decision: report.decision, report }, null, 2) }] });
      }
      return json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: "Unknown tool." } }, 404);
    } catch (error) {
      return mcpResponse(body.id, { content: [{ type: "text", text: error instanceof Error ? error.message : "Assessment failed." }], isError: true });
    }
  }
  return json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: "Method not found." } }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
    if (url.pathname === "/api/health") return json({ status: "ok", service: "ProofScope", version: "1.0.0", time: new Date().toISOString() });
    if (url.pathname === "/api/analyze") {
      try { return json(await assess(url.searchParams.get("repo") || "", env.GITHUB_TOKEN)); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Assessment failed." }, 400); }
    }
    if (url.pathname === "/api/compare") {
      try { return json(await compare(url.searchParams.getAll("repo"), env.GITHUB_TOKEN)); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Comparison failed." }, 400); }
    }
    if (url.pathname === "/mcp") {
      if (request.method !== "POST") return json({ name: "ProofScope MCP", protocol: "JSON-RPC 2.0", endpoint: "/mcp", tools: ["assess_repository", "compare_repositories"] });
      return handleMcp(request, env.GITHUB_TOKEN);
    }
    return new Response(page(), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  }
} satisfies ExportedHandler<Env>;
