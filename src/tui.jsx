/**
 * opencode-pet-statusline — a Tamagotchi-style pixel pet for the OpenCode v1
 * TUI sidebar.
 *
 * The pet is chosen deterministically from the repository name, so every
 * project keeps the same companion across restarts. It animates through moods
 * driven by what the background subagents are doing:
 *
 *   sleeping    nothing running, no recent activity   (z z z bubble)
 *   processing  at least one subagent running          (arms waving)
 *   completed   work finished, nothing running         (sparkles)
 *   failed      a subagent errored                     (alert sparks)
 *
 * Sprites are ported from review-agent
 * (packages/backend/src/tui/sprites): 51 hand-drawn bitmaps, 5 moods each,
 * 4 animation frames per mood.
 *
 * The sprite resolution follows the sidebar width: each bitmap cell is drawn
 * as N characters wide, with N picked so the pet fills the panel without
 * wrapping. Override with PET_SCALE=1|2|3.
 *
 * Env overrides:
 *   PET_SCALE  1|2|3   force the horizontal scale (default: auto)
 *   PET_SEED   <text>  force which sprite is used (default: repo name)
 */
import { createMemo, createSignal, onCleanup, Show, For } from "solid-js"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { getTamagotchiSpriteTemplateBySeed } from "./sprites.js"

const PLUGIN_ID = "pet-statusline"
const PLUGIN_VERSION = "0.2.0"

const ARROW_DOWN = "\u25BC" // ▼
const ARROW_RIGHT = "\u25B6" // ▶
const BULLET = "\u00b7" // ·

// Sidebar is 42 columns wide when OpenCode renders it (width > 120).
const SIDEBAR_WIDTH = Number(process.env.PET_SIDEBAR_WIDTH || 42)
const SPRITE_CELLS = 8 // every bitmap in the registry is 8 columns wide
const ANIMATION_MS = 160

/**
 * Horizontal scale (characters per bitmap cell). Terminal cells are roughly
 * twice as tall as they are wide, so scale 2 keeps the 8x8 art square. Narrow
 * sidebars fall back to 1; PET_SCALE forces a value.
 */
function resolveScale() {
  const forced = Number(process.env.PET_SCALE || 0)
  if (forced >= 1 && forced <= 3) return Math.floor(forced)
  const usable = SIDEBAR_WIDTH - 6
  return Math.max(1, Math.min(2, Math.floor(usable / SPRITE_CELLS)))
}

/**
 * Render one bitmap row at the given scale, keeping every cell the same width
 * so rows stay aligned (the factory's own renderer draws mood glyphs like
 * `z` / `*` two characters wide, which breaks alignment when scaled).
 */
function renderRow(row, scale) {
  const on = "\u2588".repeat(scale) // █
  const blank = " ".repeat(scale)
  let out = ""
  for (const cell of row) {
    if (cell === "#") out += on
    else if (cell === "z" || cell === "Z" || cell === "*") out += cell + " ".repeat(scale - 1)
    else out += blank
  }
  return out
}

/* -------------------------------------------------- subagent activity probe */

/** Read the freshest subagent state file written by the async-agent monitor. */
function readSubagentState() {
  // The monitor exports its exact path; trust it when present.
  const fromEnv = process.env.OPENCODE_SUBAGENT_STATUSLINE_STATE
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    try {
      return JSON.parse(readFileSync(fromEnv, "utf8"))
    } catch {
      // fall through to the scan
    }
  }

  const runtimeDir = process.env.XDG_RUNTIME_DIR || tmpdir()
  const root = join(runtimeDir, "opencode-subagent-statusline")
  let dirs
  try {
    dirs = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return undefined
  }
  if (dirs.length === 0) return undefined

  // Rank by the state FILE mtime (not the directory mtime): a directory is
  // touched once at creation, so its mtime says nothing about recent work.
  const ranked = dirs
    .map((name) => {
      const file = join(root, name, "state.json")
      try {
        return { name, file, mtime: statSync(file).mtimeMs }
      } catch {
        return { name, file, mtime: -1 }
      }
    })
    .filter((item) => item.mtime >= 0)
    .sort((a, b) => b.mtime - a.mtime)

  for (const item of ranked) {
    try {
      const state = JSON.parse(readFileSync(item.file, "utf8"))
      if (state && typeof state === "object" && state.children) return state
    } catch {
      // try the next instance
    }
  }
  return undefined
}

/** Ignore activity older than this, so a stale state file cannot pin a mood. */
const RECENT_MS = Number(process.env.PET_RECENT_MS || 120000) // 2 minutes

/**
 * Collapse the monitor's duplicated entries: each execution is written twice,
 * once bare and once suffixed with `(@<agent> subagent)`.
 */
function dedupeKey(child) {
  const label = String(child.description ?? child.title ?? child.id ?? "")
  return label.replace(/\s*\(@[^)]*\)\s*$/, "")
}

function probeActivity() {
  const state = readSubagentState()
  const counts = { running: 0, done: 0, error: 0, total: 0, lastTouched: 0 }
  if (!state?.children) return counts

  const now = Date.now()
  const seen = new Set()
  for (const child of Object.values(state.children)) {
    const stamp = Date.parse(child.updatedAt ?? child.updated_at ?? "") || 0
    if (stamp > counts.lastTouched) counts.lastTouched = stamp

    const key = dedupeKey(child)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)

    const fresh = stamp > 0 && now - stamp <= RECENT_MS
    if (!fresh) continue

    counts.total += 1
    if (child.status === "running") counts.running += 1
    else if (child.status === "error") counts.error += 1
    else if (child.status === "done") counts.done += 1
  }
  return counts
}

function createActivity() {
  const [activity, setActivity] = createSignal(probeActivity())
  const timer = setInterval(() => setActivity(probeActivity()), 1500)
  onCleanup(() => clearInterval(timer))
  return activity
}

/**
 * Is the session the user is looking at currently working? This covers the
 * common case the subagent state file cannot see: the *main* agent is busy
 * (thinking, streaming, running a tool) with no background child at all.
 */
function sessionBusy(api) {
  try {
    const route = api.route.current
    const sessionID = route?.name === "session" ? route.params?.sessionID : undefined
    if (!sessionID) return false
    const status = api.state.session.status(sessionID)
    return status?.type === "busy" || status?.type === "retry"
  } catch {
    return false
  }
}

/* ---------------------------------------------------------------- pet view */

function PetView(props) {
  const theme = () => props.api.theme.current
  const [open, setOpen] = createSignal(true)
  const activity = createActivity()

  // Poll the session status on the same cadence: `api.state.session.status()`
  // is a plain getter, not a reactive signal, so we sample it ourselves.
  const [busy, setBusy] = createSignal(sessionBusy(props.api))
  const busyTimer = setInterval(() => setBusy(sessionBusy(props.api)), 700)
  onCleanup(() => clearInterval(busyTimer))

  const scale = resolveScale()

  const seed = process.env.PET_SEED || props.api.state.path.directory || "opencode"
  const sprite = getTamagotchiSpriteTemplateBySeed(seed)

  // Mood mirrors the review-agent avatar state machine, with the session's own
  // busy state treated as "processing" so the pet reacts to the main agent too.
  const mood = createMemo(() => {
    const a = activity()
    if (a.error > 0) return "failed"
    if (a.running > 0 || busy()) return "processing"
    if (a.done > 0) return "completed"
    return "sleeping"
  })

  const frames = createMemo(() => sprite.bitmaps[mood()] ?? sprite.bitmaps.idle)
  const hold = createMemo(() => (mood() === "sleeping" ? 5 : mood() === "processing" ? 3 : 6))

  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => setTick((value) => value + 1), ANIMATION_MS)
  onCleanup(() => clearInterval(timer))

  const frameIndex = createMemo(() => {
    const list = frames()
    return Math.floor(tick() / hold()) % Math.max(1, list.length)
  })

  const lines = createMemo(() => {
    const bitmap = frames()[frameIndex()] ?? frames()[0] ?? []
    return bitmap.map((row) => renderRow(row, scale))
  })

  const moodLabel = createMemo(() => {
    const a = activity()
    switch (mood()) {
      case "processing":
        if (a.running > 0) return `${a.running} running`
        return "working"
      case "completed":
        return "idle"
      case "failed":
        return `${a.error} failed`
      default:
        return "resting"
    }
  })

  const moodColor = createMemo(() => {
    switch (mood()) {
      case "processing":
        return theme().warning
      case "completed":
        return theme().success
      case "failed":
        return theme().error
      default:
        return theme().textMuted
    }
  })

  return (
    <box>
      <box flexDirection="row" gap={1} onMouseDown={() => setOpen((x) => !x)}>
        <text fg={theme().text}>{open() ? ARROW_DOWN : ARROW_RIGHT}</text>
        <text fg={theme().text}>
          <b>Pet</b>
        </text>
        <text fg={theme().textMuted}>{sprite.displayName}</text>
      </box>
      <Show when={open()}>
        <For each={lines()}>
          {(line) => <text fg={moodColor()} wrapMode="none">{line}</text>}
        </For>
        <text fg={theme().textMuted} wrapMode="none">
          {`${BULLET} ${moodLabel()}`}
        </text>
      </Show>
    </box>
  )
}

/* --------------------------------------------------------------- register */

const tui = async (api) => {
  api.slots.register({
    // Built-in sidebar order: Context 100, MCP 200, LSP 300, Todo 400, Files 500.
    // Monitor sits at 150, Memory at 250, so the pet goes at 260 — right
    // after Memory and before the built-in LSP section.
    order: 260,
    slots: {
      sidebar_content() {
        return <PetView api={api} />
      },
    },
  })
}

const plugin = { id: PLUGIN_ID, tui }

export default plugin
