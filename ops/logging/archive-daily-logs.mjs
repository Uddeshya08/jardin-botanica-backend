#!/usr/bin/env node
import { mkdir, lstat, readdir, open, rename, unlink, realpath } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import { exportLogs, parseOptions } from "./export-logs.mjs"

const DAY = 86400000
const IST = 19800000
const NAME = /^(\d{4}-\d{2}-\d{2})-IST\.log$/

export function istDates(now = Date.now()) {
  const today = new Date(now + IST).toISOString().slice(0, 10)
  const midnight = Date.parse(`${today}T00:00:00Z`)
  // Today plus seven full prior days: at least a rolling week's history.
  return Array.from({ length: 8 }, (_, index) =>
    new Date(midnight - (7 - index) * DAY).toISOString().slice(0, 10))
}

export async function archiveDaily({ directory, backfill = false, now = Date.now(),
  request = fetch, report = message => console.error(message) }) {
  const root = path.resolve(directory)
  if (root === path.parse(root).root) throw new Error("Archive directory cannot be a filesystem root")
  await mkdir(root, { recursive: true, mode: 0o700 })
  const info = await lstat(root)
  const actualRoot = await realpath(root)
  const samePath = process.platform === "win32"
    ? actualRoot.toLowerCase() === root.toLowerCase() : actualRoot === root
  if (!info.isDirectory() || info.isSymbolicLink() || !samePath) {
    throw new Error("Archive directory must be a real directory, not a symbolic link")
  }
  const files = (await readdir(root, { withFileTypes: true }))
    .filter(file => file.isFile() && NAME.test(file.name)).map(file => file.name).sort()
  const dates = istDates(now)
  const newest = files.at(-1)?.slice(0, 10)
  const candidates = backfill || !newest || newest < dates.at(-2) ? dates : dates.slice(-2)
  const outcomes = []
  for (const date of candidates) {
    const start = `${date}T00:00:00+05:30`
    const end = new Date(Math.min(Date.parse(start) + DAY, now)).toISOString()
    if (Date.parse(start) >= Date.parse(end)) continue
    const target = path.join(root, `${date}-IST.log`)
    const temporary = path.join(root, `.${date}-${randomUUID()}.tmp`)
    let handle
    try {
      handle = await open(temporary, "wx", 0o600)
      const count = await exportLogs(parseOptions(["--start", start, "--end", end]), request,
        line => handle.writeFile(line))
      await handle.sync()
      await handle.close()
      handle = undefined
      // Never erase a previous archive just because Loki currently returns no
      // entries. Do not create empty files that suggest lost history exists.
      if (count) await rename(temporary, target)
      outcomes.push({ date, count })
      report(`${date}-IST.log: ${count} entries${count ? " saved" : "; no replacement written"}`)
    } finally {
      if (handle) await handle.close()
      await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error })
    }
  }
  // Prune only this tool's dated regular files, only after all queries succeed.
  // There is no recursive deletion; unrelated files and symlinks are untouched.
  for (const file of files) {
    if (file.slice(0, 10) < dates[0]) {
      await unlink(path.join(root, file))
      report(`Expired ${file}`)
    }
  }
  return outcomes
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    let directory = "/var/log/jd-backend"
    let backfill = false
    const args = process.argv.slice(2)
    for (let index = 0; index < args.length; index++) {
      if (args[index] === "--backfill") backfill = true
      else if (args[index] === "--directory" && args[index + 1]) directory = args[++index]
      else throw new Error(`Unknown option or missing value: ${args[index]}`)
    }
    await archiveDaily({ directory, backfill })
  } catch (error) {
    console.error(`Daily log export failed: ${error.message}`)
    process.exitCode = 1
  }
}
