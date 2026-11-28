---
name: plan-issue-run
description: Plan an unattended implement-issue run for a batch of Meddies GitHub issues and return ready-to-paste session prompts.
disable-model-invocation: true
---

Plan a run for the issues the user passed with the invocation (`#n` or URLs). No issues
given: ask for them. Implement nothing: read, decide, and return the prompts the user
pastes into implementation sessions.

## Steps

1. **Load each issue.** `gh issue view <n> --json number,title,body,labels,state`, plus its
   blockers, narrowed with `jq`:

   ```sh
   gh api graphql -f query='{repository(owner:"BraveHeart-tex",name:"Meddies"){issue(number:<n>){blockedBy(first:10){nodes{number state}}}}}'
   ```

2. **Sort.**
   - Closed: drop.
   - Design ticket (`design: true`): list apart; it runs the `design-ticket` skill.
   - Blocked by an open issue outside the list: drop and name the blocker.
   - Blocked by an issue inside the list: order it after its blocker.

3. **Find overlap.** Name the files and areas each issue touches from its body, the docs and
   frames it cites, and `rg` for the components and strings it names. Issues sharing files,
   tests or docs run in one session, one after another. Issues with no overlap may run in
   parallel sessions in separate git worktrees.

4. **Order each session.** Blockers first; then broken tests and bugs that would fail other
   issues' verification; then features, smallest first.

5. **Write one prompt per session** in this shape:

   ```
   /implement-issue #<first>

   Then run, in this same session and in this order, each after the previous one's PR is handed off green:
   1. /implement-issue #<next>

   Rules for the whole run:
   - Work unattended. Ask me only if an ambiguity changes scope, a blocker refuses to start, or Verify keeps failing after two fix attempts. For anything else, pick the reading that matches the cited spec, then note that choice in the PR evidence.
   - Before each issue, run `git status` and make sure the tree is clean, fetch origin and branch from current origin/main. If unrelated changes are present, stop and tell me.
   - <issue-specific guidance>
   - Between issues, run /compact if your context is heavy, keeping <the shared area these issues touch>.
   - At the end, give one report covering all issues: each PR link, what changed, what failed, what's next.
   ```

   Add issue-specific guidance only where it prevents a likely mistake: a scope limit,
   verbatim copy, a product doc rule to rewrite, the exact journey or visual check to run.
   A single-issue session drops the "Then run" block. A parallel session adds: "Work in your
   own git worktree. Before handoff, rebase on origin/main and push if main moved."

## Reply

- One line per dropped or design issue, with the reason.
- One line per session: its issues in order, and why they are grouped and ordered so.
- Each session's prompt in its own code block, ready to paste.
