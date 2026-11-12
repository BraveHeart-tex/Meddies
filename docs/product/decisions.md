# 07 - Delivery Slices, Feasibility & Decisions

Delivery strategy and feasibility status. Progress lives in GitHub issues.

## Delivery principles

- Use a **vertical-slice** approach that yields a demonstrable end-to-end user outcome.
- Resolve unapproved requirements and architecture boundaries before implementation; decisions already in a domain topic stay settled.
- Verify risky mobile-platform capabilities with real-device spikes early.
- Avoid broad horizontal infrastructure work that cannot yet demonstrate the core promise.

## Proposed vertical slices

| ID    | Slice                                           | Demonstrated user outcome                                                                                                    |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| VS-01 | Manual medication                               | User adds and sees a medication                                                                                              |
| VS-02 | Daily schedule                                  | User creates recurring times and sees today's planned dose                                                                   |
| VS-03 | Taken / skipped                                 | User confirms outcomes and can distinguish states                                                                            |
| VS-04 | Closed-PWA reminders                            | User receives a scheduled reminder when the app is closed                                                                    |
| VS-05 | Persistent follow-ups                           | User gets appropriate additional prompts for unresolved doses                                                                |
| VS-06 | Turkish barcode scanning                        | User identifies a product by scan and confirms its name                                                                      |
| VS-07 | Inventory / refills                             | User tracks stock and sees refill signals                                                                                    |
| VS-08 | History / progress                              | User reviews a meaningful record of past doses                                                                               |
| VS-09 | Offline / sync resilience - deferred beyond MVP | Future persistent snapshots and queued offline writes; not an MVP gate. Online uncertain-save/retry safety remains required. |

This is a proposed sequence, not a commitment to implement every capability at once. The earliest meaningful end-to-end path is **add medication → schedule dose → close PWA → receive reminder → confirm taken**.

## Feasibility gates and progress

- [FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3): Vercel Next.js deployment demonstrated; Cloudflare-first app hosting superseded.
- [FE-541](https://github.com/BraveHeart-tex/Meddies/issues/4): Narrow Google allowlist and session lifecycle demonstrated with recorded user-observed checks.
- [FE-542](https://github.com/BraveHeart-tex/Meddies/issues/5): Authenticated Vercel → Worker → remote D1/Drizzle path, atomic writes/idempotency and competing claims demonstrated.
- [FE-544](https://github.com/BraveHeart-tex/Meddies/issues/7): Synthetic D1 encrypted export, private R2 storage and isolated restore demonstrated; production automation and deleted-account reconciliation remain.
- [FE-543](https://github.com/BraveHeart-tex/Meddies/issues/6): Real installed iPhone closed/locked push delivery remains unverified and deferred. Android or simulator success does not substitute for this requirement.
- **Later catalog gate:** GTIN/data rights, coverage, real-package scan performance and refresh isolation remain to be validated before lookup integration.

These experiments establish narrowly tested properties only. The currently approved requirements and implementation statuses come from their owning topics/tickets; this list is not a readiness declaration.

## Decision register

| Topic                      | Current position                                                     | Qualification                                                                                                             |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Product                    | Private single-user initially, production-quality build              | Approved scope in topic 01 / [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2)                                 |
| Application hosting        | **Next.js on Vercel**                                                | [FE-540](https://github.com/BraveHeart-tex/Meddies/issues/3) narrow proof; supersedes Cloudflare-first app hosting        |
| Persistence / API boundary | **D1 + Drizzle through authenticated Worker**                        | [FE-542](https://github.com/BraveHeart-tex/Meddies/issues/5) remote integration proven; production hardening separate     |
| Server jobs                | Cloudflare Worker/Cron first, authenticated external trigger allowed | End-to-end reminder reliability not yet proven                                                                            |
| Push                       | FCM preferred, standard Web Push conditional fallback                | [FE-543](https://github.com/BraveHeart-tex/Meddies/issues/6) real-iPhone gate unresolved                                  |
| Backup                     | Daily encrypted independent backups, max 30-day retention            | [FE-544](https://github.com/BraveHeart-tex/Meddies/issues/7) synthetic restore proven; automation/deletion guards pending |
| Catalog                    | Separate D1 tables, manual medicine first                            | Rights, data and device feasibility unverified                                                                            |
| Redis / queues             | Avoid by default                                                     | Revisit only with measured need                                                                                           |
| Neon / Convex              | Neon approved only if D1 path fails; Convex not baseline             | No current measured reason to switch                                                                                      |
| Barcode                    | After core manual-medicine journey                                   | Separate later scope                                                                                                      |

## Frontend decision - November 6, 2026

[FE-620](https://github.com/BraveHeart-tex/Meddies/issues/82) approved Next.js section streaming with TanStack Query owning browser data, online writes with optimistic dose feedback, and no persistent browser cache or offline queue. Contract: topic 06; build rules: [Next.js](../nextjs.md) and [client state](../client-state.md).
