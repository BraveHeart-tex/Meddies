# Commit conventions

Use `type(#n): subject`. Scope to the active GitHub issue, or to the pinned
"Repository maintenance" issue ([#232](https://github.com/BraveHeart-tex/Meddies/issues/232)) when there is none. Legacy `FE-n` scopes stay valid only
for reverting old commits. Issues close by hand after their evidence comment
([tickets](tickets.md#closing)), so leave closing keywords such as `Closes #n` out of
messages. Read [commitlint.config.mjs](../commitlint.config.mjs) for allowed types
and the scope rule.

Inherited conventional rules limit header, body and footer lines to 100 characters.
Use a nonempty subject without a trailing period; avoid sentence, start, Pascal
and upper case. Separate the body from the header with a blank line.

Write commits without trailers. Before committing, validate the exact message:

```sh
printf '%s\n' "$msg" | pnpm exec commitlint
```
