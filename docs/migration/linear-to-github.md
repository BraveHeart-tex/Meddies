# Linear to GitHub migration plan

Status: Phases 0-6 done 2026-11-11 (230 issues imported as #2-#231, validated clean);
Phase 7 cutover changes awaiting maintainer review. Audited 2026-11-10. Delete this file after cutover
(Phase 8); durable rules move into the docs listed in Phase 7.

Goal: GitHub Issues + one GitHub Project become the tracker for
`BraveHeart-tex/Meddies`. Product behavior and decisions become versioned Markdown in
`docs/product/`. Linear stays untouched as a read-only archive.

## Rehearsal results (2026-11-10)

Phases 0, 1 and 4 done; sandbox repo and Project deleted. Scripts in `~/meddies-migration/bin`.

- Export: 230 issues, 455 comments (8 are thread replies, fetched with `issues replies`),
  8 project docs, 5 issue-level evidence docs (migrated as a comment on their owner issue),
  90 uploads. One upload (FE-553) is unrecoverable: its signed link expired (401); it gets a
  "file not migrated" note. Images reviewed clean by the maintainer; text scan clean.
- Comments stay separate (460, not merged). GitHub's secondary limit on creating issues and
  comments throttled after ~450 creations in 24 min, so creation is paced at 8 s
  (~2 h total). Links are batched per issue in GraphQL.
- Fixes found: `\#n` still autolinks, so local numbering is escaped as `#<!-- -->n`; non-image
  assets need an extension; `issues read` has no state type (mapped by name); Project
  workflows (for example "Item closed") cannot be enabled through the API.
- Full-scale validation: 230 issues, 181 sub-issue links, 278 blocked-by links, 230 Project
  items correct; resume after a forced kill produced no duplicates.

## 0. Decisions

Approved 2026-11-10: the Recommendation column for every row. D1, D3, D4, D5 confirmed
explicitly; the rest by default.

| ID  | Decision                                                                                                                                             | Recommendation                                                                                                                                       | Alternatives                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Repo is **public**: every imported body, comment and screenshot becomes public and indexed.                                                          | Proceed, after a secret/PII scan and a manual pass over the 128 uploaded images (Phase 1). Redact in transform, never in Linear.                     | Import only open issues publicly; keep closed history as an offline export. Make the repo private.                                    |
| D2  | Scope of issues.                                                                                                                                     | Only the Meddies project: 230 issues. The other 137 FE issues (other projects, no project, archived) stay in Linear.                                 | Also import the 94 no-project FE issues.                                                                                              |
| D3  | Closed history.                                                                                                                                      | Import all 230, closed ones as closed. 428 `FE-n` refs in code, docs and commits need a resolvable target with comments and evidence.                | Import 49 open only; ship closed history as a JSON/Markdown archive in a release asset.                                               |
| D4  | Priority.                                                                                                                                            | Keep a Project `Priority` field (Urgent/High/Medium/Low). Drop the "On completion" priority-baton ritual; next task = unblocked, ready, by Priority. | Priority labels (`priority:high`), CLI-only, no Project needed for selection. Drop priority entirely; order by milestone then number. |
| D5  | Commit scope after cutover.                                                                                                                          | `type(#n): subject`. commitlint accepts `#n` and legacy `FE-n`. Fallback scope = a pinned "Repository maintenance" issue (replaces `FE-1`).          | `type: subject (#n)` with optional scope. Keep `FE-n` as the only scope (no).                                                         |
| D6  | Legacy `FE-n` references in code, commits and design snapshots.                                                                                      | Leave them. Add a GitHub autolink `FE-<num>` to a search for `Linear ID: FE-<num>`, plus a committed map `docs/archive/linear-ids.tsv`.              | Codemod all 89 code/test refs to `#n`.                                                                                                |
| D7  | Where approved decisions live.                                                                                                                       | Inside the owning topic doc (as in Linear today); one decision register in `docs/product/decisions.md`. No ADR folder until a decision needs one.    | `docs/decisions/NNNN-*.md` ADRs for every register entry.                                                                             |
| D8  | Linear after cutover.                                                                                                                                | Do not edit issues. Add a "Moved to GitHub" banner to the project description and the 8 documents only.                                              | Also comment a GitHub link on all 230 issues (230 writes). Touch nothing.                                                             |
| D9  | Default GitHub labels not used by Meddies (`documentation`, `duplicate`, `good first issue`, `help wanted`, `invalid`, `question`, `accessibility`). | Delete them; label list = the documented vocabulary only.                                                                                            | Keep.                                                                                                                                 |
| D10 | `tracking-only` (9 issues) and `engineering-efficiency` (4) labels, not in `triage-labels.md`.                                                       | Import as-is, then decide in Phase 8: document or retire.                                                                                            | Retire during transform.                                                                                                              |
| D11 | Freeze window for the real import (Phase 5-7, roughly half a day).                                                                                   | Full freeze: no Linear edits, no agent work.                                                                                                         | Delta sync by `updatedAt` instead of freezing.                                                                                        |

## 1. Audit findings

### Linear (metadata only; no bodies read)

- Workspace `karacadev`, team `FE` ("Just Me"): 367 issues returned (101 archived), IDs FE-1..FE-785 with gaps.
- Meddies project: **230 issues**, 181 Done, 49 Backlog, 0 archived, 0 canceled.
- Hierarchy: 20 parents, 181 sub-issues, max 71 children per parent, one level deep.
- Relations (outgoing, from Meddies): 278 `blocks`, 312 `related`, 0 duplicates. Max 12 blockers into one issue. No relations leave the project.
- Labels used: `enhancement` 110, `ready-for-agent` 146, `needs-triage` 42, `ready-for-human` 18, `bug` 14, `backend` 9, `frontend` 9, `tracking-only` 9, `engineering-efficiency` 4. 10 issues unlabeled.
- Milestones (6, no target dates): `1 - Delivered baseline` .. `6 - Post-MVP: persistent offline`. 124 issues have none.
- Priorities used across FE: none 210, Urgent 6, High 34, Medium 107, Low 10.
- Descriptions: 756 KB total, max 32,319 chars (FE-539). Comments: 447, single author, no threads, max 29,330 chars. All under GitHub's 65,536-char body limit.
- Uploads: 125 `uploads.linear.app` refs (41 in 3 descriptions, 87 in 13 comments, 0 in documents). No issue attachments (PR/commit links).
- Links to rewrite: ~639 Linear issue links, ~194 Linear document links, 1 view link, 1 project link. 58 checked and 569 unchecked task-list items (render natively).
- Documents (8, ~116 KB): `00 Agent Guide & Documentation Index` (authority map, precedence, decision register), `01 Product Vision & MVP Scope`, `02 UX & User Journeys`, `03 Medication & Dose Domain`, `04 Notifications & Reminder Delivery`, `05 Turkish Medication Catalog & Barcode`, `06 Architecture, Storage & Integration`, `07 Delivery Slices, Feasibility & Decisions`.
- Spec-bearing issues: FE-539 (MVP spec, open, 32 KB), FE-612 (UX contract), FE-620 (streaming adoption), FE-545..FE-549 (approved clarifications). Doc 00 already says topic docs are normative and these issues are provenance.

### Repository coupling

- `AGENTS.md`: Done definition and progress/evidence live in Linear; `## Linear` section.
- `docs/tickets.md`: selection via the "What's Next" view and `scripts/linear-next.mjs` (imports Linearis internals for its token), `--project` rule, priority-baton rule, `ready-for-human` reminder tickets.
- `docs/triage-labels.md`, `docs/verification.md#evidence-and-completion`, `docs/authentication.md`, `docs/design/README.md`, `.agents/skills/design-ticket/SKILL.md` (`linearis files upload`).
- `commitlint.config.mjs`: `linear-issue-scope` requires `FE-n`. `docs/commits.md` uses `FE-1` as fallback; FE-1 is not in the Meddies project.
- `README.md`, `PRODUCT.md`, `DESIGN.md` point to FE-539, FE-612, FE-620 and Linear doc 00 as requirement sources.
- ~428 `FE-n` mentions: 89 in `src/` and `tests/`, rest in docs, design snapshots (`docs/design/fe-*.html`), `.impeccable/config.json`, design-ticket template.

### Agent skills

- Global `to-tickets`, `triage`, `to-spec`, `wayfinder`, `implement` are tracker-agnostic: they use the tracker conventions the repo provides.
- `setup-matt-pocock-skills/issue-tracker-github.md` already documents `gh` sub-issues, native dependencies, open-blocker counts. Reuse its commands.
- Global `linearis` skill and memory `linearis-output-shapes` stay for archive reads and other projects.

### GitHub today

- Public repo, Issues and Projects enabled, 0 issues, 1 PR (next number is #2), 0 milestones, 0 autolinks, default labels.
- `gh` 2.101.0, token scopes `repo, workflow, gist, read:org`: **missing `project`**.
- Workflows: `verify.yml`, `release.yml`. No issue templates.

## 2. Verified capabilities and limits

| Capability                 | Finding                                                                                                                                                                                                           | How verified                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Linear export              | Workspace CSV lacks comments, relations, documents, files. Use the API via `linearis`: issues, discussions (with `createdAt`), relations, children, milestones, documents, `files download`.                      | Linear docs; `linearis` 2026.8.0 output keys     |
| Linear Free limit          | 250 issues; at the limit only creation stops, nothing deleted. Whether archived issues count is undocumented.                                                                                                     | linear.app/pricing, billing docs                 |
| Sub-issues                 | `gh issue create --parent`, `gh issue edit --add-sub-issue`. Limit 100 per parent, 8 levels (max here: 71, 1 level).                                                                                              | `gh` help; GitHub docs/changelog                 |
| Dependencies               | Native blocked-by/blocking: `--blocked-by`, `--add-blocked-by`. Limit 50 per relationship type (max here: 12).                                                                                                    | `gh` help; GitHub changelog 2025-08-21           |
| Dependency reads           | `gh issue list/view --json blockedBy,blocking,parent,subIssues` works. Search `is:blocked` is inconsistent (REST 73, `gh issue list` 0, negation ignored). **Do not use search qualifiers for frontier queries.** | Ran against `cli/cli`                            |
| "Related" relation         | No native equivalent. Text mentions create timeline backlinks.                                                                                                                                                    | GitHub docs                                      |
| Issue types, issue fields  | Org-only. `repository.issueTypes` is `null` here. Use labels for category.                                                                                                                                        | GraphQL query                                    |
| Projects (Free)            | Same limits on all plans: 50,000 items, 50 fields, insights included. Field types via `gh`: TEXT, SINGLE_SELECT, DATE, NUMBER.                                                                                    | GitHub docs/changelog; `gh project field-create` |
| Attachments                | No REST endpoint. `gh issue create/comment --attach` (2.99+) uploads images/video to `user-attachments`, rewrites `![](./f.png)` refs, 50 files/command. `gh issue edit` has no `--attach`.                       | `gh` help                                        |
| Original author/timestamps | Not settable through documented APIs. Record them in text.                                                                                                                                                        | REST docs                                        |
| Autolink references        | API reachable on this repo (`GET /autolinks` = 0).                                                                                                                                                                | `gh api`                                         |
| Rate limits                | 5,000 REST req/h; secondary limits on content creation (community-reported ~80/min, ~500/h). Throttle and back off.                                                                                               | GitHub docs + community                          |
| Delete issues              | Repo admins can `gh issue delete`; numbers are never reused.                                                                                                                                                      | `gh` docs                                        |

Verify in the rehearsal (Phase 4) before relying on: autolink URL template with a query string; `gh project item-list --format json` field shape; built-in Project workflows and auto-add limit on Free; `--attach` with `--body-file` and relative refs; sub-issues/dependencies on a private sandbox repo.

## 3. Target architecture

### Sources of truth

| Content                                                   | Owner                                                   |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Product behavior, approved decisions, acceptance examples | `docs/product/*.md`                                     |
| Domain terms                                              | `GLOSSARY.md` (unchanged)                               |
| Engineering rules, architecture, verification, deployment | existing `docs/*.md`                                    |
| Design context                                            | `PRODUCT.md`, `DESIGN.md`, `docs/design/` (unchanged)   |
| Implementation scope, acceptance criteria, blockers       | GitHub issue                                            |
| Progress, evidence, discussion                            | GitHub issue comments                                   |
| Ordering and status                                       | GitHub Project fields + milestones                      |
| Linear ID traceability                                    | issue footer + `docs/archive/linear-ids.tsv` + autolink |

Rule (replaces doc 00 precedence item 2): an issue may cite and narrow docs, never restate or change product behavior. A behavior change lands as a doc edit in the same change set as the issue that needs it.

### GitHub Project "Meddies" (user-level, linked to the repo)

Fields:

- `Status` (built-in, single select): `Backlog`, `In progress`, `Done`. Readiness is the `ready-for-agent` label, not a status.
- `Priority` (single select): `Urgent`, `High`, `Medium`, `Low` (D4).
- `Linear ID` (text): `FE-123`, migrated items only.
- Built-ins shown: Milestone, Labels, Parent issue, Sub-issue progress, Assignees.

Built-in workflows: item closed -> `Done`; item reopened -> `Backlog`; item added -> `Backlog`. Auto-add from repo if the Free plan allows one workflow (verify), otherwise `gh issue create --project` per `docs/tickets.md`.

Views:

1. **Next up** (table): open, label `ready-for-agent`, sort Priority asc, then number. Mirrors "What's Next".
2. **Board**: group by Status, open only.
3. **Roadmap** (table): group by Milestone, show Sub-issue progress.
4. **Triage**: labels `needs-triage`, `needs-info`, `ready-for-human`.
5. **Parents**: issues with sub-issues, progress column.

### Labels

Category `bug`, `enhancement`; area `backend`, `frontend`; triage `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`; legacy `tracking-only`, `engineering-efficiency` (D10). Same names as Linear, so `docs/triage-labels.md` keeps its table.

### Milestones

Repo milestones with Linear names (numeric prefix keeps order). `1 - Delivered baseline` created then closed once its issues are closed. Delivery slices from doc 07 become milestone descriptions, not a doc.

### Hierarchy and dependencies

- Parent/sub-issue: native sub-issues.
- Linear "A blocks B": `gh issue edit B --add-blocked-by A`.
- Linear "related": deduplicated pairs written as a `Related: #a, #b` line in both bodies.
- Frontier query: open + `ready-for-agent` + no OPEN node in `blockedBy`, sorted by Priority.

## 4. Documentation migration

Principle: verbatim first, consolidate second, each in its own commit, so git shows exactly what changed from the Linear text.

| Linear source                              | Target                                               | Notes                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 00 Agent Guide & Index                     | `docs/product/README.md`                             | Keep authority map, topic index. Agent retrieval rules shrink into one row in the `AGENTS.md` table.                                    |
| 00 decision register, 07 decision register | `docs/product/decisions.md`                          | One register, dated rows, each linking its owning section and provenance issue (D7).                                                    |
| 01 Product Vision & MVP Scope              | `docs/product/scope.md`                              | `PRODUCT.md` keeps design-facing context and links here.                                                                                |
| 02 UX & User Journeys                      | `docs/product/ux-journeys.md`                        | FE-548/FE-549 approved sections stay; headings lose Linear URLs.                                                                        |
| 03 Medication & Dose Domain                | `docs/product/medication-domain.md`                  | Terms defer to `GLOSSARY.md`; conflicting term usages flagged, not silently changed.                                                    |
| 04 Notifications & Reminder Delivery       | `docs/product/reminders.md`                          |                                                                                                                                         |
| 05 Turkish Catalog & Barcode               | `docs/product/catalog-barcode.md`                    |                                                                                                                                         |
| 06 Architecture, Storage & Integration     | `docs/product/platform.md`                           | Product-level requirements (privacy, recovery, data ownership). Code-layer content already in `docs/architecture.md` becomes a pointer. |
| 07 delivery slices, feasibility gates      | GitHub milestones and open issues                    | Not a doc. "Workflow for agents" merges into `docs/tickets.md`.                                                                         |
| FE-539, FE-612, FE-620, FE-545..549        | GitHub issues (history) + requirement ledger (below) | FE-539 closed as "completed: superseded by docs/product" after the ledger is clean.                                                     |

Steps:

1. **Import verbatim.** `export/docs/*.md` -> `docs/product/` with the target names. Commit `docs(#n): import linear product docs verbatim`. Check: sha256 of each file equals the export.
2. **Rewrite links.** Linear document URLs -> repo paths (+ anchors). Linear issue URLs -> `#n` (after Phase 5) or `FE-n` text before it. Commit separately.
3. **Requirement ledger.** Script splits each source (8 docs + the spec issues) into atomic statements (bullets, table rows, sentences with must/never/only/approved). Each row gets a destination `path#anchor` or `superseded-by`. Agent fills, user approves every `superseded-by` row. Ledger lives in the migration workspace, not the repo.
4. **Consolidate.** Remove duplicates across docs, resolve contradictions the ledger found (listed for approval, never silently chosen), fix `README.md`, `PRODUCT.md`, `DESIGN.md` links. One commit per topic doc.
5. **Gate.** Ledger has 0 unmapped rows; `rg 'linear.app' docs README.md PRODUCT.md DESIGN.md AGENTS.md` returns only `docs/archive/`; `pnpm verify:local` passes.

Docs can migrate before issues (Linear links still resolve), shrinking the cutover.

## 5. Issue migration

### Data mapping

| Linear                           | GitHub                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| Title                            | Title, unchanged                                                   |
| Description                      | Body, links rewritten, uploads rehosted, footer appended           |
| Comments (oldest first)          | One comment each: `> Linear comment, 2026-11-07 14:03 UTC` + body  |
| State Done                       | closed, reason `completed`; Status `Done`                          |
| State Canceled (none today)      | closed, reason `not planned`                                       |
| State Backlog / Todo             | open; Status `Backlog`                                             |
| State In Progress                | open; Status `In progress`                                         |
| Priority 1-4 / 0                 | Priority Urgent/High/Medium/Low / empty                            |
| Labels                           | Same-name labels                                                   |
| Project milestone                | Repo milestone                                                     |
| Parent                           | Sub-issue of parent                                                |
| `blocks`                         | Native blocked-by                                                  |
| `related`                        | `Related:` line, both sides                                        |
| Identifier `FE-123`              | Footer `Linear ID: FE-123`, Project `Linear ID`, map row           |
| created/started/completed dates  | Footer text                                                        |
| `uploads.linear.app` image/video | `user-attachments` via `--attach`                                  |
| Other upload types               | Asset in a `linear-archive` release, linked                        |
| Linear issue/doc URLs            | `#n` / repo doc path; non-migrated FE issues keep their Linear URL |

Body footer:

```markdown
---

<sub>Migrated from Linear. Created 2026-05-01, completed 2026-06-02, state Done.</sub>
Related: #12, #40
Linear ID: FE-123
```

### Cannot migrate faithfully

- Authorship and timestamps of issues/comments: import time and your account; originals in text. Single author, so low loss.
- Activity history (state changes, edits, label changes): dropped. Linear archive keeps it.
- `related` relations: text only, no structured query.
- Linear-hosted file URLs: replaced; old URLs in git history and Linear stay Linear-only.
- Linear URLs in past commit messages and PR #1: still point to Linear (archive kept).
- Doc anchors: may shift during consolidation; ledger records final anchors.
- Issue numbers: `FE-123` != `#123`. Bridged by footer, map, autolink.
- Linear views, SLA, cycles, estimates: not used for Meddies or not carried.

### Tooling (outside the repo, not committed)

Workspace `~/meddies-migration/` with scripts in `bin/` and data in `export/` and `out/` (separate dirs; data read via path arguments). Node `.mjs`, shelling out to `linearis` and `gh` only.

- `export.mjs`: paginate `issues list --project`, then per issue `issues read`, `issues discussions`, `attachments list`; `milestones list`, `labels list`, `documents read`; `files download` every upload. Writes `export/issues/FE-n.json`, `export/docs/*.md`, `export/files/*`, `manifest.json` (counts, sha256). Read-only against Linear.
- `scan.mjs`: secrets/PII patterns over export (tokens, keys, emails, phone numbers, env values); lists images for manual review (D1).
- `transform.mjs`: pure, offline. Produces `out/FE-n/body.md`, `out/FE-n/comments/NNN.md`, `out/plan.json` (labels, milestone, state, priority, parent, blockers, related, files). Re-runnable and diffable.
- `import.mjs --repo <r> --only FE-a,FE-b | --all --step <create|comments|links|project|rewrite>`: idempotent, driven by `state.json` (`FE-n -> {number, dbId, nodeId, itemId, done: {...}, commentsPosted: n}`), written after every API call. Throttle 1 write per 1.5 s; on 403/429 honor `retry-after`, else exponential backoff. On a missing state entry, search `"Linear ID: FE-n"` before creating.
- `validate.mjs`: reads GitHub back and compares to `plan.json` and the export (Phase 6 checks).

Steps per issue, in FE ascending order:

1. **create**: `gh issue create --title --body-file --label --milestone [--attach ...]`; close with reason if Done/Canceled.
2. **comments**: `gh issue comment --body-file [--attach ...]` per comment.
3. **links**: after all issues exist, `--add-sub-issue` and `--add-blocked-by` per edge.
4. **project**: `gh project item-add`, then `item-edit` for Status, Priority, Linear ID.
5. **rewrite**: fetch the _current_ body/comments from GitHub (keeps `user-attachments` URLs), replace migrated Linear URLs and `FE-n` mentions with `#n`, add `Related:`, `gh issue edit --body-file` / `gh api PATCH` comments only where changed.

Estimated writes: ~2,050 (230 creates, 447 comments, ~460 links, ~920 project, ~230 edits). About 1-3 h with throttling.

## 6. Workflow, skill and automation changes

Repo (one cutover commit set, Phase 7):

- `AGENTS.md`: Done = evidence comment in the active GitHub issue; `## Linear` -> `## GitHub Issues` (use `gh`, `--body-file` with quoted heredoc, read back); add docs row `Product behavior -> docs/product/README.md`.
- `docs/tickets.md`: rewrite for `gh`. Selecting work (frontier query below), shape (`Parent` -> `#n`), creating (`gh issue create --project Meddies --milestone --label --parent --blocked-by`), priority without the baton rule, scope changes, closing (comment, then `gh issue close`; never closing keywords, because pushes go straight to main before Release proves them). Fold in tracker commands from `issue-tracker-github.md` and doc 07 "Workflow for agents".
- `docs/triage-labels.md`: "Linear labels" -> "GitHub labels".
- `docs/verification.md`, `docs/authentication.md`, `docs/design/README.md`: active GitHub issue; screenshots via `gh issue comment --attach`.
- `.agents/skills/design-ticket/SKILL.md`: `linearis files upload` -> `gh issue comment --attach`; precedent IDs stay as `FE-n` (autolinked).
- `docs/commits.md` + `commitlint.config.mjs`: rule `issue-scope` accepts `^#[1-9]\d*$` or `^FE-[1-9]\d*$` (D5); fallback = maintenance issue.
- `scripts/linear-next.mjs`: delete. Replacement in `docs/tickets.md`, or a short `scripts/next-issue.mjs` if the Priority sort needs Project data:

```sh
gh issue list --state open --label ready-for-agent --limit 200 \
  --json number,title,blockedBy,projectItems \
  --jq '[.[] | select([.blockedBy.nodes[]? | select(.state=="OPEN")] | length == 0)]'
# then sort by Project Priority (shape of projectItems verified in Phase 4)
```

- `README.md`, `PRODUCT.md`, `DESIGN.md`: links to `docs/product/`.
- `docs/archive/linear-ids.tsv`: `FE-n`, `#n`, title (D6).
- Optional: `.github/ISSUE_TEMPLATE/ticket.md` with Parent / What to build / Acceptance criteria.

GitHub settings: autolink `FE-<num>` -> `https://github.com/BraveHeart-tex/Meddies/issues?q=%22Linear+ID%3A+FE-<num>%22` (D6); pin the maintenance issue.

Global (outside repo, after cutover): memory `linearis-output-shapes` noted as non-Meddies; no global skill edits needed (tracker-agnostic).

No new GitHub Actions. Native Project workflows cover status sync.

## 7. Phased execution

Each phase ends at a gate; stop and report if a gate fails.

### Phase 0: Prepare (no writes)

1. Approve D1-D11.
2. `gh auth refresh -s project`; confirm `gh auth status` lists `project`.
3. Create `~/meddies-migration/{bin,export,out}`; record `linearis --version`, `gh --version`.
4. Optional insurance: Linear workspace CSV export (Settings > Administration > Import Export) saved to `export/csv/`.

Gate: scopes present, approvals recorded in the tracking issue (created in Phase 3).

### Phase 1: Export and scan (Linear read-only)

1. `node bin/export.mjs --project "Meddies - Medication Reminder & Tracker" --out export`
2. Check `manifest.json`: 230 issues, 447 comments, 8 docs, 278 blocks, 312 related, 181 parents set, 125 upload refs all downloaded.
3. `node bin/scan.mjs export` -> fix list; review images (D1).

Gate: counts match this audit (or differences explained); scan findings resolved as redactions in transform.

### Phase 2: Docs (can ship while Linear is still the tracker)

Run Section 4 steps 1-5 on a branch; merge to main after `pnpm verify:local`.

Gate: Section 4 step 5.

### Phase 3: GitHub scaffolding (Meddies repo)

1. Labels: create missing, update colors/descriptions, delete D9 defaults.
2. Milestones: create 6 in order.
3. Project: `gh project create --owner @me --title Meddies`; `gh project link`; create `Priority`, `Linear ID`; set Status options; enable built-in workflows; create the 5 views (UI).
4. Autolink (D6). Maintenance issue (D5). Tracking issue "Migrate from Linear" holding this checklist.

Gate: `gh label list`, `gh api repos/:owner/:repo/milestones`, `gh project field-list` match Section 3.

### Phase 4: Rehearsal in a sandbox repo

1. Create private `BraveHeart-tex/meddies-migration-sandbox` + sandbox Project; repeat Phase 3 there.
2. `import.mjs --repo <sandbox> --only <pilot set>`: one parent with its children, a 12-blocker issue, FE-539 (largest body), an issue with 41 uploads, the 13-comment issue, a Done and a Backlog issue (~15 issues).
3. Validate (Phase 6 checks on the subset); inspect rendering by eye.
4. Run `--all` in the sandbox to measure duration, rate-limit behavior and resume (kill mid-run, rerun).
5. Verify the open items from Section 2. Adjust scripts. Delete the sandbox repo and project.

Gate: full sandbox run validates clean; resume proven; decisions on any surprises.

### Phase 5: Real import

1. Start freeze (D11). Re-export (Phase 1) and diff against the previous export.
2. Pilot: `import.mjs --repo BraveHeart-tex/Meddies --only <same pilot set> --step create,comments` then `links,project,rewrite` limited to those. Validate. Pause for your review.
3. `--all` per step: `create`, `comments`, `links`, `project`, `rewrite`. Resumable; rerun any step safely.

Gate: Phase 6 passes.

### Phase 6: Validation checks

- Counts: 230 issues with `Linear ID`; 181 closed `completed`, 49 open; 447 migrated comments; 181 sub-issue links; blocked-by edges equal the deduplicated export count; 230 Project items.
- Per issue: title equal; labels, milestone, state, Priority, Status equal to `plan.json`; body text equals transform output after normalizing rewritten links and attachment URLs.
- Links: 0 `linear.app/karacadev/issue/FE-<migrated>` and 0 `uploads.linear.app` in migrated bodies/comments; every `user-attachments` URL returns 200.
- Traceability: each `FE-n` in the map resolves to exactly one issue via search and autolink.
- Docs: Section 4 gate still green.
- Agent dry run: fresh Claude Code and Codex sessions, using only repo docs, pick the next task, read it with blockers, and post a test evidence comment on the maintenance issue (then delete it).

### Phase 7: Cutover

1. Commit Section 6 repo changes (`docs(#n): move tracking to github issues`, `build(#n): accept github issue scopes`, etc.), each validated with commitlint; `pnpm verify:local`; push.
2. Commit `docs/archive/linear-ids.tsv`.
3. Linear banners (D8). End freeze.
4. First real ticket worked end to end on GitHub (selection, commit `feat(#n)`, evidence, close).

Gate: Release run green for the cutover commits; first ticket closed with evidence.

### Phase 8: Cleanup (after ~2 weeks of use)

Close the tracking issue, delete this file, settle D10, prune unused views/fields, revoke nothing in Linear.

## 8. Rollback

- **Before Phase 7:** Linear remains the source of truth and was never modified. Delete created issues from `state.json` (`gh issue delete <n> --yes`), the Project, milestones, labels and autolink; revert the Phase 2 docs commits if wanted. Burned numbers are cosmetic.
- **Partial import:** rerun the failed step (idempotent) or roll back as above.
- **After Phase 7:** revert the cutover commits; Linear is still intact but at its issue cap, so new work would need archiving or a paid plan. Prefer fixing forward.

## 9. Risks

| Risk                                                   | Mitigation                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Private content goes public (D1)                       | Scan + image review + redaction in transform; pilot review before `--all`.                      |
| Requirements lost or contradicted in doc consolidation | Verbatim commit, requirement ledger, approval of every `superseded-by`, contradictions flagged. |
| Duplicate issues after an interrupted run              | `state.json` per call + `Linear ID` search before create.                                       |
| Secondary rate limits / spam flagging                  | 1 write/1.5 s, backoff, sandbox measurement first.                                              |
| Undocumented `--attach` upload route changes           | Fallback: release assets for files; pilot early.                                                |
| Edits in Linear during import                          | Freeze + re-export diff.                                                                        |
| Rewrite pass clobbers attachment URLs                  | Rewrite from GitHub's current body, not transform output.                                       |
| Agents keep using Linear habits                        | Cutover commit updates every doc/skill in one change; agent dry run gate.                       |
| `projectItems` lacks Priority values for CLI selection | Fall back to priority labels (D4 alternative) or `gh project item-list`.                        |

## 10. Simplifications over the Linear setup

- Product specs in git: reviewed in diffs, no "fetch Linear doc" step, one authority map.
- No priority baton or "On completion" sections; native blockers plus Priority define the frontier.
- No `ready-for-human` reminder tickets: label the real issue and assign it.
- No Status "Todo/Ready" duplicating `ready-for-agent`.
- Delete `scripts/linear-next.mjs` (depends on Linearis internals) for a `gh` query.
- `feat(#n)` commits auto-link into the issue timeline, so commit traceability is free.
- Labels-only categories (no issue types needed); no custom Actions.
- Delivery slices live as milestones, not a separate doc.

## Sources

- [Linear: exporting data](https://linear.app/docs/exporting-data), [pricing](https://linear.app/pricing), [billing and plans](https://linear.app/docs/billing-and-plans)
- [GitHub REST: issue dependencies](https://docs.github.com/en/rest/issues/issue-dependencies), [changelog: dependencies on issues](https://github.blog/changelog/2025-08-21-dependencies-on-issues/)
- [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [About Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects), [increased item limits](https://github.blog/changelog/2025-02-26-increased-items-in-github-projects-now-in-public-preview/), [issue fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-issue-fields)
- [Community: no attachment upload API](https://github.com/orgs/community/discussions/46951)
- Local: `gh` 2.101.0 help for `issue create/edit/comment/list`, `project`; `linearis` 2026.8.0 output.
