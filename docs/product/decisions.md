# 07 - Delivery Slices

Delivery strategy. Progress lives in GitHub issues; architecture decisions and feasibility
evidence live in [topic 06](./platform.md).

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
