#!/usr/bin/env node
// Generates a standalone comparison page from the design lab registry and review captures.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { require as requireTs } from 'tsx/cjs/api'
import { z } from 'zod'

const template = new URL(
  '../.agents/skills/design-ticket/templates/comparison.html',
  import.meta.url,
)
const directionLetter = z.enum(['A', 'B', 'C'])
const labels = z.record(z.string(), z.string())
const specSchema = z.strictObject({
  title: z.string(),
  intro: z.string().optional(),
  directions: z.partialRecord(
    directionLetter,
    z.strictObject({
      name: z.string(),
      pitch: z.string(),
      facts: labels,
      tradeOffs: labels,
    }),
  ),
  recommendation: z.strictObject({
    direction: directionLetter,
    reasons: z.array(z.string()).min(1),
  }),
  openQuestions: z.array(z.string()),
  decisions: z.array(z.string()).optional(),
  buildTicket: z.number().int().positive().optional(),
})

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/g, (character) => entities[character])
}

function list(items) {
  return items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p>None.</p>'
}

async function renderFrames(frames, directory, label) {
  const figures = await Promise.all(
    frames.map(async ({ slug, title, citation }) => {
      const name = `${slug}-402x874.png`
      const path = join(directory, name)
      const capture = await readFile(path).catch((error) => {
        if (error.code !== 'ENOENT') throw error
        throw new Error(`Missing capture for ${citation}: ${path}`)
      })
      if (!capture.length) throw new Error(`Empty capture for ${citation}: ${path}`)
      return `<figure id="${escapeHtml(slug)}">
      <img src="data:image/png;base64,${capture.toString('base64')}" alt="${escapeHtml(title)}" width="402" />
      <figcaption><code>${escapeHtml(citation)}</code> ${escapeHtml(title)}</figcaption>
    </figure>`
    }),
  )
  return `<div class="strip" tabindex="0" role="group" aria-label="${label}">${figures.join('\n')}</div>`
}

async function renderDirection(letter, direction, frames, directory, badge) {
  const facts = Object.entries(direction.facts).map(
    ([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
  )
  const tradeOffs = Object.entries(direction.tradeOffs).map(
    ([label, value]) => `<p><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</p>`,
  )
  return `<section class="dir" aria-labelledby="d${letter}">
    <header>
      <p class="letter">Direction ${letter}</p>
      <h2 id="d${letter}">${escapeHtml(direction.name)}</h2>
      ${badge ? `<span class="rec">${badge}</span>` : ''}
      <p class="pitch">${escapeHtml(direction.pitch)}</p>
    </header>
    ${await renderFrames(frames, directory, `Direction ${letter} screens`)}
    ${facts.length ? `<dl class="facts">${facts.join('\n')}</dl>` : ''}
    ${tradeOffs.length ? `<div class="trade">${tradeOffs.join('\n')}</div>` : ''}
  </section>`
}

async function main() {
  const {
    values,
    positionals: [issue, ...extra],
  } = parseArgs({
    allowPositionals: true,
    options: {
      spec: { type: 'string' },
      captures: { type: 'string' },
      approved: { type: 'string' },
    },
  })
  if (!/^[1-9]\d*$/.test(issue ?? '') || extra.length || !values.spec || !values.captures) {
    throw new Error(
      'Usage: node scripts/lab-compare.mjs <n> --spec <json> --captures <dir> [--approved <letter>]',
    )
  }
  const approved =
    values.approved === undefined ? null : directionLetter.parse(values.approved.toUpperCase())
  const spec = specSchema.parse(JSON.parse(await readFile(values.spec, 'utf8')))
  const { designFrames } = requireTs('../src/features/design-lab/frames.tsx', import.meta.url)
  const frames = designFrames.filter(
    ({ slug, status }) => slug.startsWith(`${issue}-`) && status !== 'built',
  )
  const preferred = approved ? 'approved' : 'draft'
  const status = frames.some((frame) => frame.status === preferred)
    ? preferred
    : approved
      ? 'draft'
      : 'approved'
  const groups = Map.groupBy(
    frames.filter((frame) => frame.status === status),
    ({ slug }) => slug[issue.length + 1].toUpperCase(),
  )
  if (!groups.size) throw new Error(`No draft or approved frames for #${issue}`)

  const recommended = spec.recommendation.direction
  const showRecommendation = !approved && (status === 'draft' || groups.has(recommended))
  const featured = approved ?? (showRecommendation ? recommended : null)
  const otherLetters = [...groups.keys()].filter((letter) => letter !== 'S' && letter !== featured)
  const letters = approved ? [approved] : featured ? [featured, ...otherLetters] : otherLetters
  if (!letters.length) throw new Error(`No directions for #${issue}`)
  const directions = await Promise.all(
    letters.map(async (letter) => {
      if (!groups.has(letter)) throw new Error(`No frames for direction ${letter} of #${issue}`)
      if (!spec.directions[letter])
        throw new Error(`Missing spec for direction ${letter} of #${issue}`)
      const badge = letter === featured ? (approved ? 'Approved' : 'Recommended') : ''
      return renderDirection(
        letter,
        spec.directions[letter],
        groups.get(letter),
        values.captures,
        badge,
      )
    }),
  )

  const shared = groups.has('S')
    ? `<section class="shared" aria-labelledby="sh">
    <h2 id="sh">Shared frames</h2>
    ${await renderFrames(groups.get('S'), values.captures, 'Shared screens')}
  </section>`
    : ''
  const record = approved
    ? `<section class="next">
    <h2>Decisions</h2>
    ${list(spec.decisions ?? [])}
    <h2>${spec.buildTicket ? `Still open for #${spec.buildTicket}` : 'Still open for the build ticket'}</h2>
    ${list(spec.openQuestions)}
  </section>`
    : `<section class="next">
    <h2>Decide</h2>
    ${list(['Which direction to approve.', ...spec.openQuestions])}
  </section>`
  const replacements = {
    title: escapeHtml(spec.title),
    issue,
    intro: escapeHtml(spec.intro ?? ''),
    recommendation: showRecommendation
      ? `<div class="pick"><strong>I recommend Direction ${recommended}.</strong>${list(spec.recommendation.reasons)}</div>`
      : '',
    directions: directions.join('\n'),
    shared,
    record,
  }
  const html = (await readFile(template, 'utf8'))
    .replace(/<!-- comparison instructions:[\s\S]*?-->\s*/, '')
    .replace(/\{\{(\w+)\}\}/g, (token, key) =>
      Object.hasOwn(replacements, key) ? replacements[key] : token,
    )
  const placeholder = html.match(/\{\{[^{}<>\r\n]*(?:\}\})?/)
  if (placeholder) throw new Error(`Unfilled placeholder: ${placeholder[0]}`)
  process.stdout.write(html)
}

try {
  await main()
} catch (error) {
  console.error(`[lab:compare] ${error.message}`)
  process.exitCode = 1
}
