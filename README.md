# ProofScope

ProofScope is an evidence-first repository due-diligence service for agents and development teams. It turns public GitHub signals into a transparent delivery and release-risk brief with source links for every signal.

## What it does

- assesses activity, documentation, security posture, maintenance signals and release cadence;
- returns a deterministic 100-point score with plain-language rationale;
- includes an MCP endpoint with `assess_repository` and `compare_repositories` tools;
- exposes a browser experience for human reviewers at the service root.

## API

`GET /api/analyze?repo=owner/repository` returns an assessment for a public repository.

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
