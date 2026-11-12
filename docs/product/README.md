# Product docs

Approved product behavior. The assigned issue owns scope and acceptance criteria; these topics own
behavior ([tickets](../tickets.md)). Open the topic the issue cites, and a second one only when the
first lacks a rule you need. Read only the cited sections and their acceptance examples; list a
topic's sections with `rg -n '^#' docs/product/<file>.md`. Approval history lives in the linked
issues.

| Topic | Document                                                     | Open for                                                      |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| 01    | [Product Vision & MVP Scope](./scope.md)                     | Mission, MVP boundaries, exclusions                           |
| 02    | [UX & User Journeys](./ux-journeys.md)                       | Screens, the session contract, export and deletion            |
| 03    | [Medication & Dose Domain](./medication-domain.md)           | Medicines, schedules, dose outcomes, stock                    |
| 04    | [Notifications & Reminder Delivery](./reminders.md)          | Push, follow-ups, snooze, quiet hours, food and refill alerts |
| 05    | [Turkish Medication Catalog & Barcode](./catalog-barcode.md) | Catalog and barcode lookup, later scope                       |
| 06    | [Architecture, Storage & Integration](./platform.md)         | Hosting, persistence, operations, backups                     |
| 07    | [Delivery Slices, Feasibility & Decisions](./decisions.md)   | Slices, feasibility gates, decision register                  |
| -     | [Deferred scope](./deferred.md)                              | Approved rules deferred beyond MVP, such as offline use       |

Issues cite topics by number ("topic 03"). Visual and interaction design lives in
[DESIGN.md](../../DESIGN.md) and [PRODUCT.md](../../PRODUCT.md). When an issue contradicts a topic,
flag it to the maintainer before building. A newly approved product rule lands in its topic in the
same change set.
