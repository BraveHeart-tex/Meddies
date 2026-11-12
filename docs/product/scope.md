# 01 - Product Vision & MVP Scope

## Product intent

**Meddies** is a mobile-first, installable medication reminder and tracking PWA for ongoing medication routines.

**Mission:** Never miss a dose. Never run out. Feel in control.

**Core promise:** Never forget a dose. Medication organization and proactive reminders take priority over gamification or secondary wellness features.

The expected initial audience is a single private user, but the product should be engineered to production standards rather than as a disposable prototype.

## Product pillars

1. **Remember:** Proactive, configurable reminders that work when the PWA is closed, subject to platform feasibility.
2. **Track:** An unambiguous daily schedule and records for scheduled, taken, skipped and not logged doses.
3. **Organize:** Medication records, barcode-assisted Turkish medication name identification, stock counts and refill alerts.

## Current frontend and connectivity scope - November 6, 2026

Writes require connectivity, and the open session keeps loaded data, drafts and save recovery in memory; the [session contract](./ux-journeys.md#session-contract) in topic 02 has the details. PWA installation and closed-app push stay in scope; persistent offline use is [deferred](./deferred.md).

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

**Cozy Care:** cozy, cheerful and dependable, without childish or clinically sterile styling. The visual direction lives in [DESIGN.md](../../DESIGN.md) and the voice in [copy](../copy.md). Prioritize large touch targets, accessible contrast, and purposeful motion.

Clarity and reliable medication records take precedence over reward mechanics. The product is an organizational tool, not a substitute for medical guidance.

## Explicit private-MVP exclusions

No public registration or multi-tenant/caregiver features; medical advice, drug-interaction or dosage recommendations; unsupported liquid/injection/cream units; taper or alternating-cycle schedules; recurrence anchored to actual intake or automatic travel-timezone adaptation; email reminder delivery, meal logging, unlimited follow-ups or inferred missed intake; persistent offline viewing, queued offline dose writes, offline setup/schedule editing/snooze, guaranteed closed-app background sync, real-time cross-device synchronization, advertising analytics or speculative infrastructure. Barcode-assisted lookup follows the manual-medicine core and requires independent rights/device validation.
