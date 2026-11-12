# Meddies - Agent Guide & Documentation Index

> **Agent entrypoint.** Read the assigned ticket and its directly referenced domain sections. Use this index **only when the ticket lacks exact spec pointers**. Never preload all topics, [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) or completed clarification tickets by default.

## Approved behavior authority map (November 6, 2026)

Use the **assigned issue** for implementation scope, acceptance criteria, dependencies, and ownership. Use the **domain topic** below for approved product behavior. The [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) parent is product intent and historical synthesis, **not a mandatory full-document read for every implementation ticket**. Do not fetch completed clarification issues merely to rediscover their rules; consult them only for approval provenance or contradictions.

| Concern                                                                               | Authoritative domain topic                                        | Approved clarification / provenance                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recurrence, weekdays, interval timing, edit cutoff, end dates, pause/resume           | [03 - Medication & Dose Domain](./medication-domain.md)           | [FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8), approved Nov 3; 15 examples in topic 03                                                                                  |
| Medication model, intake records, quantities, stock and low-stock episodes            | [03 - Medication & Dose Domain](./medication-domain.md)           | [FE-547](https://github.com/BraveHeart-tex/Meddies/issues/10), approved Nov 3; 23 examples in topic 03                                                                                 |
| Dose reminders, follow-ups, snooze, quiet hours, delivery limitations and food alerts | [04 - Notifications & Reminder Delivery](./reminders.md)          | [FE-546](https://github.com/BraveHeart-tex/Meddies/issues/9), approved Nov 3; 19 timelines in topic 04                                                                                 |
| Online session continuity and deferred offline scope                                  | [02 - UX & User Journeys](./ux-journeys.md)                       | [FE-620](https://github.com/BraveHeart-tex/Meddies/issues/82), approved Nov 6; current session contract in topic 02; FE-548/19 offline examples preserved as deferred historical scope |
| Export, selected-history deletion, account deletion and data retention behavior       | [02 - UX & User Journeys](./ux-journeys.md)                       | [FE-549](https://github.com/BraveHeart-tex/Meddies/issues/12), approved Nov 3; 16 examples in topic 02; topic 06 has restore/integration constraints                                   |
| Hosting, persistence and runtime integration                                          | [06 - Architecture, Storage & Integration](./platform.md)         | [FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3) supersedes Cloudflare-first app hosting: Next.js starts on Vercel                                                         |
| Product goals and MVP boundaries                                                      | [01 - Product Vision & MVP Scope](./scope.md)                     | [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) is the parent/historical synthesis                                                                                        |
| Medication catalog and barcode discovery                                              | [05 - Turkish Medication Catalog & Barcode](./catalog-barcode.md) | Data/licensing/feasibility decisions in topic 05                                                                                                                                       |
| Delivery order and experiments                                                        | [07 - Delivery Slices, Feasibility & Decisions](./decisions.md)   | Individual GitHub issues own execution                                                                                                                                                 |

**Supersession rule:** [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2)'s original “Explicit specification gaps” list predates [FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8) through [FE-549](https://github.com/BraveHeart-tex/Meddies/issues/12). Those completed clarifications resolved their corresponding gaps; do not classify them as open solely because the parent still lists them. The Cloudflare-first app-hosting text in [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) is similarly superseded by the approved Vercel decision. Other unapproved questions remain open and must not be inferred from these approvals.

**Cross-domain boundary:** Scheduling recurrence and end-date semantics belong to topic 03; notification submission, snooze, follow-up timing and delivery failure semantics belong to topic 04. A ticket may need both domains, but should not load unrelated topics. Product behavior lives in the domain documents; UI/control implementation ownership stays in the tickets. Preserve old links, source approvals and examples.

**Project:** [Meddies GitHub Project](https://github.com/users/BraveHeart-tex/projects/3)
**Mission:** Never miss a dose. Never run out. Feel in control.

> **Current MVP scope - approved November 6, 2026:** [FE-620](https://github.com/BraveHeart-tex/Meddies/issues/82) supersedes the earlier offline MVP commitment. Writes require connectivity; optimistic dose changes remain visibly unconfirmed until acknowledged. Previously loaded data, drafts and uncertain-save recovery live in memory during the open session. Persistent offline availability, queued offline writes and pending-work recovery after reload/app closure are deferred beyond MVP. Server retry, revision, ownership and stock correctness remain required. Implementation is separate from this planning approval.

## Authority and precedence

1. **Approved product behavior:** The owning topic document (02-04 for operational behavior, 01 for scope, 05 for catalog boundaries, 06 for architecture) is normative. Its approved decision tables and acceptance cases take precedence over older proposals.
2. **Implementation scope:** The assigned GitHub issue owns deliverables, acceptance criteria, dependencies and other tickets' implementation ownership. Native dependency links are not additional behavioral specs.
3. **Approval provenance:** [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) preserves the original MVP approval and detailed historical synthesis; [FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8) through [FE-549](https://github.com/BraveHeart-tex/Meddies/issues/12) preserve the approved refinements. Do **not** fetch [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) or completed clarification issues by default when their rules are incorporated into the relevant topic.
4. **New decisions:** If a newer issue explicitly approves a product-rule change, reconcile it with the owning topic document before treating the revised behavior as authoritative. Flag contradictions rather than silently choosing.
5. **Implementation evidence:** Source code, passing tests and experiments prove only what was tested, not additional product requirements.

**Important approved update:** The Next.js app **starts on Vercel** (see [FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3)), superseding earlier Cloudflare-first app-hosting proposals. D1 + Drizzle remains the first database choice, subject to validation. Do not rely on outdated hosting guidance in topic docs.

## Topic index

| Document                                                            | Open for                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [01 - Product Vision & MVP Scope](./scope.md)                       | Mission, product pillars, scope context                                                                       |
| [02 - UX & User Journeys](./ux-journeys.md)                         | Screens, interaction principles and flows                                                                     |
| [03 - Medication & Dose Domain](./medication-domain.md)             | Medication, recurrence, dose states, stock                                                                    |
| [04 - Notifications & Reminder Delivery](./reminders.md)            | Push, iOS, scheduling, follow-ups                                                                             |
| [05 - Turkish Medication Catalog & Barcode](./catalog-barcode.md)   | GTIN, barcode and Turkish data sources; later scope                                                           |
| [06 - Architecture, Storage & Integration](./platform.md)           | D1/Drizzle, integrations, technical trade-offs                                                                |
| [07 - Delivery Slices, Feasibility & Decisions](./decisions.md)     | Vertical slices, spikes, decision tracking                                                                    |
| Repo `DESIGN.md`, `PRODUCT.md` and `.agents/skills/meddies-design/` | UI and visual design work; [FE-612](https://github.com/BraveHeart-tex/Meddies/issues/74) governs interactions |

## Retrieval rules

- **Fast path:** Read the assigned GitHub issue, then only its directly referenced governing topic and section(s). If a legacy ticket lacks precise references, use the authority map above; do not expand the parent just because it is linked.
- **No automatic exploration:** Do not fetch [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2), completed clarification tickets, the archived handoff, every domain document or neighboring implementation tickets by default.
- **Escalate only for a blocker:** Fetch a second topic, source approval or related issue when the first topic lacks an implementation-critical rule, contradicts another approved rule, or implementation ownership cannot otherwise be established.
- **Decision updates:** Apply newly approved product decisions to their owning topic, retain approval provenance, and replace obsolete "open" wording.
- **Privacy:** Notifications never establish intake; medication information is sensitive.

## Example routing

| Ticket intent                                          | Read for behavior                                                                               | Other retrieval only if needed                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Daily/weekday/interval schedules or course end         | Topic 03, Scheduling - Approved Contract                                                        | Topic 04 for reminder submission; [FE-562](https://github.com/BraveHeart-tex/Meddies/issues/25) for end-date **control ownership** |
| Dose records and stock                                 | Topic 03, Domain & Dose Logging / [FE-547](https://github.com/BraveHeart-tex/Meddies/issues/10) | Topic 02 current online/session contract; offline mutations deferred                                                               |
| Snooze, quiet hours, food push                         | Topic 04, Reminder Policy / [FE-546](https://github.com/BraveHeart-tex/Meddies/issues/9)        | Topic 03 for course-end suppression                                                                                                |
| Session recovery or export/deletion                    | Topic 02, Current online and session interaction contract / revised FE-549                      | Topic 06 for hydration, cache ownership and integration                                                                            |
| Streaming, query caching or frontend mutation lifetime | Topic 06, Frontend streaming, Query and session contract                                        | Assigned FE-620 child for implementation ownership; FE-639 for rollout gate                                                        |
| Runtime or deployment                                  | Topic 06                                                                                        | Relevant completed experiment for evidence                                                                                         |
| New product requirement or cross-domain decision       | Topic 01 and directly affected domain topics                                                    | [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) and historical approvals if needed                                    |

The former all-in-one conversation handoff is **not** a dependency of this knowledge base.

## Approved decision register (November 3, 2026)

These five tickets record historical approved refinements, with **92 acceptance examples** preserved in their governing topic documents. FE-548's 19 offline examples are deferred beyond MVP by the November 6 FE-620 decision; FE-549 queue references are revised for session-only actions. Their issue pages retain approval and verification provenance; this navigation index avoids repeating the rules.

| Decision                                   | Governing document and section                                                                                                                                               | Approval source / examples                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Recurrence, edits, end dates               | [03 - Medication & Dose Domain](./medication-domain.md), [FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8) **- Approved scheduling boundaries**                   | [FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8), 15  |
| Follow-ups, snooze, delayed jobs           | [04 - Notifications & Reminder Delivery](./reminders.md), [FE-546](https://github.com/BraveHeart-tex/Meddies/issues/9) **- Approved snooze and delayed-reminder boundaries** | [FE-546](https://github.com/BraveHeart-tex/Meddies/issues/9), 19  |
| Stock threshold episodes                   | [03 - Medication & Dose Domain](./medication-domain.md), [FE-547](https://github.com/BraveHeart-tex/Meddies/issues/10) **- Approved low-stock transitions**                  | [FE-547](https://github.com/BraveHeart-tex/Meddies/issues/10), 23 |
| Offline availability - historical/deferred | [02 - UX & User Journeys](./ux-journeys.md), [FE-548](https://github.com/BraveHeart-tex/Meddies/issues/11) **- Approved offline availability boundaries**                    | [FE-548](https://github.com/BraveHeart-tex/Meddies/issues/11), 19 |
| Export and deletion                        | [02 - UX & User Journeys](./ux-journeys.md), [FE-549](https://github.com/BraveHeart-tex/Meddies/issues/12) **- Approved export and deletion scope**                          | [FE-549](https://github.com/BraveHeart-tex/Meddies/issues/12), 16 |

Every specifically enumerated discovery gap in the original [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2) gap list was clarified by [FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8) through [FE-549](https://github.com/BraveHeart-tex/Meddies/issues/12). Real-iPhone push feasibility, operational robustness and implementation details still require their own evidence.
