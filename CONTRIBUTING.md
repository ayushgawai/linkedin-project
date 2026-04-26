# Contributing to LinkedIn Clone

Thank you for contributing to this project. Please read and follow these guidelines before opening a pull request.

---

## Table of Contents

1. [Branch Naming](#branch-naming)
2. [Commit Messages](#commit-messages)
3. [Pull Request Process](#pull-request-process)
4. [Code Style](#code-style)
5. [What Never to Commit](#what-never-to-commit)
6. [Weekly Sync](#weekly-sync)

---

## Branch Naming

All branches must follow this pattern:

```
feature/<member>/<short-description>
```

Examples:

```
feature/member1/profile-service
feature/member2/job-search-endpoint
feature/member6/seed-loader
fix/member3/application-status-bug
```

- Use lowercase and hyphens only — no spaces or underscores
- Keep the description short (3–5 words max)
- Prefix with `fix/` for bug fixes, `chore/` for non-feature work

---

## Commit Messages

Use this format for every commit:

```
[SERVICE] short description in imperative mood
```

Examples:

```
[PROFILE] add search endpoint with pagination
[JOB] fix salary range parsing for hourly rates
[DATA] add seed loader idempotency check
[CI] add flake8 lint step to workflow
[MESSAGING] handle Kafka unavailable error
```

Service tags: `PROFILE`, `JOB`, `APPLICATION`, `MESSAGING`, `CONNECTION`, `ANALYTICS`, `AI`, `DATA`, `CI`, `INFRA`

- Keep the subject line under 72 characters
- Use imperative mood ("add", "fix", "remove" — not "added" or "fixes")
- Add a blank line + body if the change needs more explanation

---

## Pull Request Process

1. **Branch off `main`** — never commit directly to `main`
2. **Open a PR** with a clear title and description of what changed and why
3. **CI must pass** — all lint and test checks must be green before review
4. **Minimum 1 approval** required from another team member before merge
5. **Resolve all comments** before merging
6. **Squash or rebase** to keep history clean — avoid merge commits where possible
7. **Delete your branch** after it is merged

PRs that touch shared infrastructure (database schema, Kafka topics, `.env.example`) require a heads-up in the group chat before merging.

---

## Code Style

### Python (services in `/data`, `/tests`, and any Python microservice)

- Formatter: **black** (line length 100)
- Linter: **flake8** and **ruff**
- Run before pushing:
  ```bash
  flake8 data/ tests/ --max-line-length=100
  ruff check data/ tests/
  ```

### JavaScript / TypeScript (frontend and Node services)

- Linter: **ESLint** with the project's `.eslintrc` config
- Run before pushing:
  ```bash
  npx eslint src/
  ```

CI enforces both — a failing lint check blocks the PR.

---

## What Never to Commit

| File / Pattern | Reason |
|---|---|
| `.env` | Contains real credentials |
| `data/raw/` | Large Kaggle CSVs — gitignored |
| `node_modules/` | Installed locally, not tracked |
| `__pycache__/`, `*.pyc` | Python bytecode |
| `tests/coverage/` | Generated reports |
| Any file with a real password, API key, or token | Security |

If you accidentally committed a secret, notify the team immediately and rotate the credential — do not just delete the file in a follow-up commit.

---

## Weekly Sync

- **When:** Every Monday
- **Format:** Standup — 3 questions per member:
  1. What did I complete last week?
  2. What am I working on this week?
  3. Any blockers?
- **Where:** Group chat / video call (coordinate in the group chat)

If you are blocked, do not wait until Monday — post in the group chat right away so the team can help.
