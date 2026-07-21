# ProofScope

[简体中文](README.zh-CN.md)

ProofScope is an evidence-first integration decision service for agents and development teams. It turns public GitHub signals into a transparent delivery brief with source links for every signal, a deterministic adoption recommendation, and explicit verification gates.

## What it does

- assesses activity, documentation, security posture, maintenance signals and release cadence;
- returns a deterministic 100-point score with plain-language rationale;
- returns a deterministic `proceed`, `review`, or `block` decision with evidence-linked next steps;
- compares two to four repositories against the same transparent decision model;
- includes an MCP endpoint with `assess_repository`, `compare_repositories`, and `assess_integration_risk` tools;
- exposes a browser experience for human reviewers at the service root.

## API

`GET /api/analyze?repo=owner/repository` returns an assessment for a public repository.

`GET /api/compare?repo=owner/repository&repo=owner/repository` compares two to four public repositories.

`POST /mcp` implements JSON-RPC MCP calls. Start with `initialize`, then `tools/list`, then `tools/call`.

## Design principles

The service never invents repository facts. Scores are derived from public GitHub API responses and every result includes direct evidence links so an agent or reviewer can validate the assessment.

## Local development

```bash
npm install
npm run dev
npm run test
```

Then open `http://localhost:8787` and assess a public GitHub repository.
