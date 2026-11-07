# Commit conventions

Use `type(FE-n): subject`. Scope to the active Linear issue, or `FE-1` when there
is none. Read [commitlint.config.mjs](../commitlint.config.mjs) for allowed types
and the scope rule.

Inherited conventional rules limit header, body and footer lines to 100 characters.
Use a nonempty subject without a trailing period; avoid sentence, start, Pascal
and upper case. Separate the body from the header with a blank line.

Write commits without trailers. Before committing, validate the exact message:

```sh
printf '%s\n' "$msg" | pnpm exec commitlint
```

Use the repository-installed commitlint so validation matches the pinned config.
