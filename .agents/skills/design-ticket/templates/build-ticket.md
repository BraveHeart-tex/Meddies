## Parent

{{Parent ticket link}}

## What to build

{{The behaviour from the user's side, one paragraph.}}

Approved rules, by frame ([FE-{{n}}]({{link}}) "Approved design" table):

- **{{n}}·A1:** {{What the screen shows and does, with copy in quotes.}}
- **{{n}}·A2, A4:** {{...}}
- **{{n}}·S1:** {{...}}
- {{Rules from "Decided by Bora after approval", each on its own line.}}

The lab composes these screens from lab-local parts ({{files}}); build them as production
components and point the lab frames at them.

Tests prove this slice; no browser journey unless an allowed reason in
`docs/verification.md` applies.

Out of scope: {{each nearby item and the ticket that owns it}}.

## Acceptance criteria

- [ ] {{One checkable outcome}} ({{n}}·A1)
- [ ] {{...}} ({{n}}·A3, A5)
