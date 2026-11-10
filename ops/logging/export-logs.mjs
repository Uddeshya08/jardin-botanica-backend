#!/usr/bin/env node
import { pathToFileURL } from "node:url"

export function parseOptions(args) {
  const options = { service: "jd-backend_api", url: "http://127.0.0.1:3100" }
  for (let index = 0; index < args.length; index++) {
    const key = args[index]
    if (key === "--require-results") { options.requireResults = true; continue }
    if (!["--start", "--end", "--contains", "--service", "--url"].includes(key) ||
      args[index + 1] == null || args[index + 1].startsWith("--")) {
      throw new Error(`Unknown option or missing value: ${key}`)
    }
    options[key.slice(2)] = args[++index]
  }
  for (const key of ["start", "end"]) {
    const value = options[key]
    if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || Date.parse(value) < 0) {
      throw new Error(`--${key} requires an ISO timestamp with timezone (Z or +05:30)`)
    }
  }
  options.startNs = BigInt(Date.parse(options.start)) * 1000000n
  options.endNs = BigInt(Date.parse(options.end)) * 1000000n
  if (options.endNs <= options.startNs) throw new Error("--end must be after --start")
  if (!/^[a-zA-Z0-9_.-]+$/.test(options.service)) throw new Error("Invalid service name")
  const url = new URL(options.url)
  // The unencrypted, unauthenticated archive must only be queried locally.
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("--url must be an HTTP loopback origin, optionally with a port")
  }
  return options
}

export function utcTimestamp(ns) {
  const value = BigInt(ns)
  return new Date(Number(value / 1000000n)).toISOString().replace(/\.\d{3}Z$/,
    `.${String(value % 1000000000n).padStart(9, "0")}Z`)
}

const writeStdout = line => new Promise((resolve, reject) => {
  process.stdout.write(line, error => error ? reject(error) : resolve())
})

export async function exportLogs(options, request = fetch, write = writeStdout) {
  let cursor = options.startNs
  let limit = 1000
  let count = 0
  let query = `{service=${JSON.stringify(options.service)}}`
  if (options.contains) query += ` |= ${JSON.stringify(options.contains)}`
  while (cursor < options.endNs) {
    const url = new URL("/loki/api/v1/query_range", options.url)
    // Loki includes the end boundary; this CLI defines an exclusive --end.
    url.search = new URLSearchParams({ query, start: String(cursor),
      end: String(options.endNs - 1n), direction: "forward", limit: String(limit) }).toString()
    const response = await request(url, { signal: AbortSignal.timeout(60000) })
    if (!response.ok) throw new Error(`Loki query failed: HTTP ${response.status}; export may be partial`)
    const body = await response.json()
    if (body.status !== "success" || body.data?.resultType !== "streams") {
      throw new Error("Loki returned an invalid response; export may be partial")
    }
    const rows = body.data.result.flatMap(stream => stream.values.map(([ns, line]) => ({
      ns: BigInt(ns), line, labels: stream.stream,
    }))).sort((left, right) => left.ns < right.ns ? -1 : left.ns > right.ns ? 1 : 0)
    if (!rows.length) break
    if (rows.some(row => row.ns < cursor || row.ns >= options.endNs)) {
      throw new Error("Loki returned entries outside the requested range")
    }
    const last = rows.at(-1).ns
    const full = rows.length >= limit
    if (full && last === cursor) {
      if (limit < 5000) { limit = 5000; continue }
      throw new Error("Too many entries at one timestamp; export stopped rather than skipping logs")
    }
    // Withhold the final timestamp of a full batch. Re-query it inclusively so
    // entries split across batches are neither skipped nor emitted twice.
    for (const row of rows) {
      if (full && row.ns === last) continue
      await write(`${utcTimestamp(row.ns)} ${JSON.stringify(row.labels)} ${row.line}\n`)
      count++
    }
    if (!full) break
    cursor = last
  }
  return count
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseOptions(process.argv.slice(2))
    const count = await exportLogs(options)
    console.error(`Exported ${count} entries; interval [${options.start}, ${options.end}).`)
    if (options.requireResults && !count) process.exitCode = 2
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
