## What to build

{{The behaviour from the user's side, at most 150 words.}}

## Rules

Approved rules, by frame ([#{{n}}]({{link}}) "Approved design" table):

- **{{n}}·A1:** {{What the screen shows and does, with copy in quotes.}}
- **{{n}}·A2, A4:** {{...}}
- **{{n}}·S1:** {{...}}
- {{Rules from "Decided by Bora after approval", each on its own line.}}
- Build the lab-local parts ({{files}}) as production components. Move the frames for
  design-critical screens to `built/`, rendering production code with updated outlines, and
  delete the rest (`docs/design/README.md#built-frames`).
- Tests prove this slice; no browser journey unless an allowed reason in
  `docs/verification.md` applies.

## Ownership

- Owns: {{frames this ticket builds, such as {{n}}·A1, A2}}
- Uses: {{existing items it builds on, with their owner issue}}
- Out of scope: {{each nearby item and the issue that owns it}}

## Size

Migrations 0 · New screens {{n}} · Owned frames {{n}} · Journeys 0 · Proofs {{n}}

## Acceptance criteria

- [ ] {{One checkable outcome}} ({{n}}·A1) - Evidence: {{one proof}}
- [ ] {{...}} ({{n}}·A3, A5) - Evidence: {{...}}
