import { describe, expect, it } from "vitest";
import { buildAssessment } from "../src/index";

const repo = {
  full_name: "acme/healthy-repo", html_url: "https://github.com/acme/healthy-repo", description: "A documented example.", homepage: "https://example.com", default_branch: "main", archived: false, fork: false, stargazers_count: 120, forks_count: 10, open_issues_count: 4, subscribers_count: 2, updated_at: "2026-07-20T00:00:00Z", pushed_at: "2026-07-20T00:00:00Z", created_at: "2024-01-01T00:00:00Z", license: { spdx_id: "MIT", name: "MIT License" }, topics: ["api", "mcp", "workers"], owner: { login: "acme", avatar_url: "https://example.com/avatar.png", html_url: "https://github.com/acme" }
};

describe("buildAssessment", () => {
  it("creates an evidence-linked score without exceeding 100", () => {
    const report = buildAssessment(repo, { health_percentage: 100, files: { readme: "README.md", contributing: "CONTRIBUTING.md", issue_template: ".github/ISSUE_TEMPLATE", code_of_conduct: "CODE_OF_CONDUCT.md", license: "LICENSE" } }, true, { published_at: "2026-07-10T00:00:00Z" });
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.grade).toBe("A");
    expect(report.signals).toHaveLength(5);
    expect(report.evidence.every((item) => item.url.startsWith("https://github.com/"))).toBe(true);
  });
});
