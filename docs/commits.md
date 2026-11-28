# Commit conventions

Use `type(#n): subject`. Scope to the active GitHub issue, or to the pinned
"Repository maintenance" issue ([#232](https://github.com/BraveHeart-tex/Meddies/issues/232)) when there is none. Legacy `FE-n` scopes stay valid only
for reverting old commits. Issues close through the Closeout workflow or by hand
([tickets](tickets.md#closing)), so leave closing keywords such as `Closes #n` out of
messages and PR descriptions. Read [commitlint.config.mjs](../commitlint.config.mjs) for allowed types
and the scope rule.

Inherited conventional rules limit header, body and footer lines to 100 characters.
Use a nonempty subject without a trailing period; avoid sentence, start, Pascal
and upper case. Separate the body from the header with a blank line.

Write commits without trailers. Before committing, validate the exact message:

```sh
printf '%s\n' "$msg" | pnpm exec commitlint
```

## PR descriptions

Main takes squash merges only: the PR title becomes the commit header, so it follows the same
`type(#n): subject` rule within 92 characters (GitHub appends ` (#<pr>)`), and the squash
commit has no body. Validate the title like a commit
message.

A PR that completes one whole issue carries one line `Complete Meddies issue: #<n>` and an
`## Evidence` section holding the [evidence](verification.md#evidence); merging it closes the
issue ([closing](tickets.md#closing)). Omit the line when the PR completes no issue or only part
of one, and still give evidence for the criteria it covers.
