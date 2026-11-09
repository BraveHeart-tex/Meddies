#!/usr/bin/env node
import { ESLint } from 'eslint'

// Separate non-suppressible pass: ordinary lint rules retain documented inline escapes.
const eslint = new ESLint({ allowInlineConfig: false })
const results = (await eslint.lintFiles(['src', 'worker', 'tests']))
  .map((result) => {
    const messages = result.messages.filter((message) => message.ruleId === 'meddies/architecture')
    return { ...result, messages, errorCount: messages.length, warningCount: 0 }
  })
  .filter((result) => result.errorCount)
if (results.length) console.error((await eslint.loadFormatter('stylish')).format(results))
console.log(`[architecture] ${results.length ? 'FAIL' : 'PASS'}`)
process.exitCode = results.length ? 1 : 0
