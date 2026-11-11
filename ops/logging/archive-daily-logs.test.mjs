import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { archiveDaily, istDates } from "./archive-daily-logs.mjs"

const now = Date.parse("2026-11-11T01:00:00+05:30")
const success = values => ({ ok: true, json: async () => ({ status: "success", data: {
  resultType: "streams", result: [{ stream: { service: "jd-backend_api" }, values }],
} }) })

async function fixture(fn) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "jd-daily-logs-"))
  try { await fn(directory) } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith("jd-daily-logs-"))
    await rm(directory, { recursive: true, force: true })
  }
}

test("IST day changes at 18:30 UTC and keeps today plus seven completed dates", () => {
  assert.deepEqual(istDates(now), ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
    "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"])
  assert.equal(istDates(Date.parse("2026-11-10T18:29:59Z")).at(-1), "2026-11-10")
  assert.equal(istDates(Date.parse("2026-11-10T18:30:00Z")).at(-1), "2026-11-11")
})

test("first run backfills available days; refresh replaces complete files without duplicating entries", async () => {
  await fixture(async directory => {
    let calls = 0
    const request = async url => {
      calls++
      const start = BigInt(url.searchParams.get("start"))
      return success([[String(start + 1n), "cart_test"]])
    }
    await archiveDaily({ directory, now, request, report: () => {} })
    assert.equal(calls, 8)
    assert.equal((await readdir(directory)).length, 8)
    const today = path.join(directory, "2026-11-11-IST.log")
    const first = await readFile(today, "utf8")
    assert.match(first, /^2026-11-10T18:30:00\.000000001Z/)
    calls = 0
    await archiveDaily({ directory, now, request, report: () => {} })
    assert.equal(calls, 2)
    assert.equal(await readFile(today, "utf8"), first)
  })
})

test("failed export preserves existing files and does not prune; successful export prunes only managed old files", async () => {
  await fixture(async directory => {
    const today = path.join(directory, "2026-11-11-IST.log")
    const old = path.join(directory, "2026-11-03-IST.log")
    await writeFile(today, "previous complete export\n")
    await writeFile(old, "old archive\n")
    await writeFile(path.join(directory, "investigation-notes.txt"), "keep me")
    await assert.rejects(archiveDaily({ directory, now, report: () => {},
      request: async () => ({ ok: false, status: 503 }) }), /503/)
    assert.equal(await readFile(today, "utf8"), "previous complete export\n")
    assert.equal(await readFile(old, "utf8"), "old archive\n")
    assert.equal((await readdir(directory)).filter(file => file.endsWith(".tmp")).length, 0)
    await archiveDaily({ directory, now, request: async () => success([]), report: () => {} })
    assert.equal(await readFile(today, "utf8"), "previous complete export\n")
    assert.equal((await readdir(directory)).includes("2026-11-03-IST.log"), false)
    assert.equal(await readFile(path.join(directory, "investigation-notes.txt"), "utf8"), "keep me")
  })
})

test("empty history creates no misleading daily files and filesystem roots are refused", async () => {
  await fixture(async directory => {
    await archiveDaily({ directory, now, request: async () => success([]), report: () => {} })
    assert.deepEqual(await readdir(directory), [])
  })
  await assert.rejects(archiveDaily({ directory: path.parse(process.cwd()).root, now }), /filesystem root/)
})
