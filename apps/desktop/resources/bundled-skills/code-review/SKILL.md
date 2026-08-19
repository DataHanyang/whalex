---
name: code-review
description: Review a diff, branch, or PR for real defects — correctness first, then security, then maintainability — and report verified findings with severity. Use when asked to review code, check a change, or before an important commit.
---

# Code review

Review the CHANGE, judged against the codebase it lands in. Read the diff
first, then open every touched file with enough surrounding context to
judge it — a diff hunk alone routinely lies.

## Pass 1 — correctness (only real bugs count)

- Inputs that break it: empty, null, zero, negative, huge, duplicate,
  unicode/Hangul, concurrent.
- Off-by-one, inverted condition, wrong operator precedence, floating-point
  equality, timezone/DST assumptions.
- Error paths: what happens when the awaited call rejects, the file is
  missing, the API returns 500? Swallowed errors are findings.
- State: mutation of shared objects, stale caches, resources opened but
  never closed, races between async steps.
- For each suspected bug, construct the concrete failing scenario (input →
  wrong output). If you can't, downgrade it to a question, not a finding.

## Pass 2 — security

Injection (SQL/shell/path/HTML), secrets or keys in code or logs, unsafe
deserialization, missing authz on new endpoints, user input reaching
`execute`/`eval`/file paths unvalidated.

## Pass 3 — maintainability (short)

Dead code introduced, duplicated logic that already exists in the repo
(name where), misleading names, missing tests for the new behavior, public
API changes that break callers not in the diff.

## Reporting

Findings sorted by severity (blocker / should-fix / nit), each with:
file:line, one-sentence claim, and the concrete failure scenario. Quote the
code you're judging. Separate "verified bug" from "smells odd, please
confirm" — never present a guess as a defect. If the change is clean, say
so plainly and list what you checked; don't invent nits to look thorough.
Do NOT rewrite the code unless asked — review and implementation are
different requests.
