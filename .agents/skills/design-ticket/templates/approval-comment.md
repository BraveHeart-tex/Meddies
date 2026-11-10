## Design approved - {{Month D, YYYY}}

Bora approved **Direction {{A}}, {{name}}** after comparing three directions ({{A: ...}},
{{B: ...}}, {{C: ...}}). Comparison page: {{artifact URL}}

**Decisions from review**

- {{One decision per line, with the copy as approved.}}

**Frames:** `/lab/{{n}}-a1` to `{{n}}-a{{k}}` ({{what they cover}}), `{{n}}-s1` to
`{{n}}-s{{k}}` ({{what they cover}}).

**Evidence**

- Commit {{sha}}: `pnpm verify:local` passed. {{Pushed and Release run, or "local, not
  pushed yet, so the Release proof is pending".}}
- `pnpm lab:capture {{n}}-`: all {{count}} frames at 402x874 and 320x740 with no horizontal
  overflow and no console errors.
- {{Tests added for any non-lab logic, such as a preview helper.}}

**Not verified:** {{device, VoiceOver, real keyboard, iOS keyboard over pinned controls.}}

**Open for FE-{{build}}:** {{questions the build ticket must settle}}

![{{n}}·A1]({{uploaded URL}})
