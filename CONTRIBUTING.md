# Contributing to ProofScope

## Before opening a change

1. Keep claims evidence-backed and avoid inferred repository facts.
2. Add or update a focused test for scoring behavior.
3. Run `npm run check` and `npm test`.

## Pull requests

Describe the user impact, list the public GitHub signals affected, and keep API responses backward compatible. Do not add credentials, private repository content, or analytics payloads to the repository.

## Product principles

Every score must be explainable, every signal must link to evidence, and a failed upstream request must fail safely rather than fabricate a result.
