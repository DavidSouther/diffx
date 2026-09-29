// Feature: durable, editable review comments (wong2/diffx #28, #29, #34).
// Design: .ailly/developer/2026-09-29-A-comment-persistence/design.md
//
// Given a repository with the one-commit range HEAD~1..HEAD,
// When a reviewer comments in a session without --persist, copies the comments, and stops diffx,
// And starts diffx --persist on the same range and imports the copied text,
// And edits one imported comment,
// And stops diffx and starts diffx --persist on the same range again,
// Then both comments are on their lines, the edit is kept with an "edited" label,
// And the review status reports that 2 comments were restored.

import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const CLI = join(REPO_ROOT, 'dist', 'cli.mjs')
const RANGE = 'HEAD~1..HEAD'

const FIRST = 'Rename message to greeting'
const FIRST_EDITED = 'Rename message to greeting and return it inline'
const SECOND = 'Return the template literal directly'

interface DiffxSession {
  url: string
  output: () => string
  stop: () => Promise<void>
}

// The comment shape that agents read from GET /api/comments.
interface AgentComment {
  filePath: string
  side: 'additions' | 'deletions'
  lineNumber: number
  startLineNumber?: number
  lineContent: string
  body: string
  status: 'open' | 'resolved'
  editedAt?: number
}

let workDir: string
let fixtureRepo: string
let fakeHome: string
let browser: Browser
let context: BrowserContext
const running = new Set<ChildProcess>()

function isolatedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: fakeHome,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: join(fakeHome, '.gitconfig'),
  }
  delete env.XDG_CONFIG_HOME
  return env
}

function git(...args: string[]): void {
  execFileSync(
    'git',
    ['-c', 'user.name=Reviewer', '-c', 'user.email=reviewer@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: fixtureRepo, env: isolatedEnv(), stdio: 'pipe' },
  )
}

function createFixtureRepo(): void {
  git('init', '-q', '-b', 'main')
  writeFileSync(join(fixtureRepo, 'greet.ts'), ["export function greet(name: string) {", "  return 'Hi ' + name", '}', ''].join('\n'))
  git('add', '.')
  git('commit', '-q', '-m', 'base')
  writeFileSync(
    join(fixtureRepo, 'greet.ts'),
    ['export function greet(name: string) {', '  const message = `Hello, ${name}!`', '  return message', '}', ''].join('\n'),
  )
  git('add', '.')
  git('commit', '-q', '-m', 'head')
}

function buildDiffx(): void {
  // Vitest sets NODE_ENV=test on its own process. `vite build` only forces
  // NODE_ENV to 'production' when it isn't already set, so without this
  // override the client bundle is built with the dev JSX transform
  // (`jsxDEV`) against the production `react/jsx-runtime`, which doesn't
  // export it — the app then throws on first render.
  const buildEnv = { ...process.env, NODE_ENV: 'production' }
  const run = (script: string, args: string[]) =>
    execFileSync(process.execPath, [join(REPO_ROOT, script), ...args], { cwd: REPO_ROOT, env: buildEnv, stdio: 'pipe' })
  run('node_modules/vite/bin/vite.js', ['build'])
  run('node_modules/tsdown/dist/run.mjs', [])
}

function startDiffx(flags: string[]): Promise<DiffxSession> {
  const child = spawn(process.execPath, [CLI, ...flags, '--no-open', '--', RANGE], {
    cwd: fixtureRepo,
    env: isolatedEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  running.add(child)
  let output = ''
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
  exited.then(() => running.delete(child))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`diffx did not start:\n${output}`)), 20_000)
    const onData = (chunk: Buffer) => {
      output += chunk.toString()
      const match = output.match(/diffx server running at (http:\/\/\S+)/)
      if (match) {
        clearTimeout(timer)
        resolve({
          url: match[1],
          output: () => output,
          stop: async () => {
            child.kill('SIGINT')
            await exited
          },
        })
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`diffx exited with code ${code} before it started:\n${output}`))
    })
  })
}

async function openReview(url: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(url)
  await page.locator('.file-diff-card').first().waitFor()
  return page
}

async function agentView(url: string): Promise<AgentComment[]> {
  const comments = (await (await fetch(`${url}/api/comments`)).json()) as AgentComment[]
  return comments.sort((a, b) => a.lineNumber - b.lineNumber)
}

function anchorOf({ filePath, side, lineNumber, startLineNumber, lineContent }: AgentComment) {
  return { filePath, side, lineNumber, startLineNumber, lineContent }
}

function bubble(page: Page, text: string) {
  return page.locator('.comment-bubble').filter({ hasText: text })
}

async function addComment(page: Page, newLine: number, body: string): Promise<void> {
  const lineNumber = page.locator(`[data-column-number="${newLine}"][data-line-type="change-addition"]`).first()
  const plus = page.locator('[data-utility-button]').first()
  await expect
    .poll(
      async () => {
        await lineNumber.hover()
        return plus.isVisible()
      },
      { timeout: 10_000, interval: 200 },
    )
    .toBe(true)
  await plus.click()
  const form = page.locator('.comment-form')
  await form.getByPlaceholder('Leave a review comment...').fill(body)
  await form.getByRole('button', { name: 'Comment', exact: true }).click()
  await bubble(page, body).waitFor()
}

describe('durable, editable review comments', () => {
  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'diffx-durable-comments-'))
    fixtureRepo = join(workDir, 'repo')
    fakeHome = join(workDir, 'home')
    mkdirSync(fixtureRepo)
    mkdirSync(fakeHome)
    createFixtureRepo()
    buildDiffx()
    browser = await chromium.launch()
    context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  }, 180_000)

  afterAll(async () => {
    for (const child of running) child.kill('SIGKILL')
    await browser?.close()
    if (workDir) rmSync(workDir, { recursive: true, force: true })
  })

  it('keeps imported and edited comments across a restart with --persist', async () => {
    // Session 1: no --persist. Comments last only for this session; the reviewer copies them.
    const first = await startDiffx([])
    let page = await openReview(first.url)
    await page.getByRole('button', { name: 'Session only', exact: true }).waitFor()
    await addComment(page, 2, FIRST)
    await addComment(page, 3, SECOND)
    await page.getByRole('button', { name: 'Copy comments (2)', exact: true }).click()
    await page.getByRole('button', { name: 'Copied!', exact: true }).waitFor()
    const exported = await page.evaluate(() => navigator.clipboard.readText())
    expect(exported).toContain(FIRST)
    expect(exported).toContain(SECOND)
    const original = await agentView(first.url)
    expect(original.map((c) => [c.filePath, c.side, c.lineNumber])).toEqual([
      ['greet.ts', 'additions', 2],
      ['greet.ts', 'additions', 3],
    ])
    await page.close()
    await first.stop()

    // Session 2: --persist on the same range. The reviewer imports the copied text, then edits one comment.
    const second = await startDiffx(['--persist'])
    expect(await agentView(second.url)).toEqual([])
    page = await openReview(second.url)
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    const panel = page.getByRole('dialog', { name: 'Review comments' })
    await panel.getByRole('textbox', { name: 'Paste a Copy comments export' }).fill(exported)
    await panel.getByRole('button', { name: 'Import', exact: true }).click()
    await expect.poll(async () => (await panel.getByRole('status').textContent()) ?? '').toBe('Imported 2 comments.')
    await bubble(page, FIRST).waitFor()
    await bubble(page, SECOND).waitFor()

    const commentId = await bubble(page, FIRST).getAttribute('id')
    const firstComment = page.locator(`[id="${commentId}"]`)
    await firstComment.getByRole('button', { name: 'Edit comment' }).click()
    const editor = firstComment.getByRole('textbox')
    expect(await editor.inputValue()).toBe(FIRST)
    await editor.fill(FIRST_EDITED)
    await firstComment.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(async () => (await firstComment.textContent()) ?? '').toContain(FIRST_EDITED)
    await firstComment.getByText('edited', { exact: true }).waitFor()
    await page.close()
    await second.stop()

    // Session 3: --persist on the same range again. The imported and edited comments come back.
    const third = await startDiffx(['--persist'])
    page = await openReview(third.url)
    await page.getByRole('button', { name: 'Saved · 2 restored', exact: true }).waitFor()
    await expect.poll(() => third.output()).toMatch(/2 restored/)

    const restoredFirst = bubble(page, FIRST_EDITED)
    await restoredFirst.waitFor()
    await restoredFirst.getByText('edited', { exact: true }).waitFor()
    await bubble(page, SECOND).waitFor()

    // Each comment keeps the anchor that the reviewer gave it in session 1: file, side, line, and code.
    const restored = await agentView(third.url)
    expect(restored.map(anchorOf)).toEqual(original.map(anchorOf))
    expect(restored.map((c) => [c.body, c.status])).toEqual([
      [FIRST_EDITED, 'open'],
      [SECOND, 'open'],
    ])
    expect(typeof restored[0].editedAt).toBe('number')
    expect(restored[1].editedAt).toBeUndefined()

    await page.close()
    await third.stop()
  }, 120_000)
})
