> **Current MVP scope - approved November 6, 2026:** [FE-620](https://github.com/BraveHeart-tex/Meddies/issues/82) supersedes the earlier offline MVP commitment. Writes require connectivity; optimistic dose changes remain visibly unconfirmed until acknowledged. Previously loaded data, drafts and uncertain-save recovery live in memory during the open session. Persistent offline availability, queued offline writes and pending-work recovery after reload/app closure are deferred beyond MVP. Server retry, revision, ownership and stock correctness remain required. Implementation is separate from this planning approval.

# 01 - Product Vision & MVP Scope

> **Status:** Approved product intent and MVP boundaries; implementation is underway. This document governs scope, not detailed operational behavior or current ticket progress. See the Meddies Agent Guide & Documentation Index for the owning domain specifications.

## Product intent

**Meddies** is a mobile-first, installable medication reminder and tracking PWA for ongoing medication routines.

**Mission:** Never miss a dose. Never run out. Feel in control.

**Core promise:** Never forget a dose. Medication organization and proactive reminders take priority over gamification or secondary wellness features.

The expected initial audience is a single private user (the creator's girlfriend), but the product should be engineered to production standards rather than as a disposable prototype.

## Product pillars

1. **Remember:** Proactive, configurable reminders that work when the PWA is closed, subject to platform feasibility.
2. **Track:** An unambiguous daily schedule and records for taken, skipped, scheduled and overdue doses.
3. **Organize:** Medication records, barcode-assisted Turkish medication name identification, stock counts and refill alerts.

## Current frontend and connectivity scope - November 6, 2026

Writes require connectivity. Dose recording/correction provides optimistic feedback with honest pending state and session recovery. Cached navigation, selected dates and unfinished drafts persist in memory during the open session. Reload/closure may require a fresh server load and may discard pending recovery details/drafts. Next.js streams initial content into TanStack Query; see topic 06. This supersedes the earlier FE-548 offline MVP commitment without changing PWA installation or closed-app push scope.

## MVP capability boundaries

- Today's doses and the next required action.
- My Medications with current inventory.
- Add a medication manually first, with barcode-assisted setup as a subsequent slice.
- Define recurring dose schedules.
- Mark scheduled doses taken or skipped, with a clear history.
- Installable experience on iPhone and Android.
- Backend-driven reminders and user-configurable reminder intensity.
- Truthful guidance when push is unavailable or disabled. Email reminders are a potential future fallback, **not** in the approved private MVP.
- Refill signals based on remaining inventory.

## Product personality and UX guardrails

**Playful Precision:** friendly, motivational, reassuring and dependable; cheerful without childish or clinically sterile styling. Visual references: Carely (friendly illustrations), Pillo (proactive reminders) and Apple Health (interaction clarity). The intended palette uses iris purple, mint, sunshine yellow, warm off-white and dark ink. Prioritize large touch targets, accessible contrast, and purposeful motion.

Clarity and reliable medication records take precedence over reward mechanics. The product is an organizational tool, not a substitute for medical guidance.

## Scope status

The above captures approved product intent and scope, not the complete operational contract. Approved recurrence, notification, stock, online/session, export and deletion decisions are in domain topics 02-04, including [FE-545](https://github.com/BraveHeart-tex/Meddies/issues/8) through [FE-549](https://github.com/BraveHeart-tex/Meddies/issues/12). Screen-level layout details and real-iPhone notification feasibility remain unsettled. Refer to topic 06 for verified technical boundaries.

## Explicit private-MVP exclusions

No public registration or multi-tenant/caregiver features; medical advice, drug-interaction or dosage recommendations; unsupported liquid/injection/cream units; taper or alternating-cycle schedules; recurrence anchored to actual intake or automatic travel-timezone adaptation; email reminder delivery, meal logging, unlimited follow-ups or inferred missed intake; persistent offline viewing, queued offline dose writes, offline setup/schedule editing/snooze, guaranteed closed-app background sync, real-time cross-device synchronization, advertising analytics or speculative infrastructure. Barcode-assisted lookup follows the manual-medicine core and requires independent rights/device validation.

These are scope boundaries from [FE-539](https://github.com/BraveHeart-tex/Meddies/issues/2); approved operational details belong to their domain topics.

## Related documents

- 02 - UX & User Journeys
- 03 - Medication & Dose Domain
- 04 - Notifications & Reminder Delivery
- 07 - Delivery Slices, Feasibility & Decisions
- Documentation index: [Meddies 00 - Agent Guide & Documentation Index](./README.md)

---

[Back to Meddies - Agent Guide & Documentation Index](./README.md)
