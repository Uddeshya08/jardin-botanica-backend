import { test } from "node:test"
import assert from "node:assert/strict"
import { parseOptions, exportLogs, utcTimestamp } from "./export-logs.mjs"

const args = ["--start", "2026-11-07T19:48:00+05:30", "--end", "2026-11-07T23:48:00+05:30"]
const response = values => ({ ok: true, json: async () => ({ status: "success", data: {
  resultType: "streams", result: [{ stream: { service: "jd-backend_api" }, values }],
} }) })

test("IST incident window is converted to UTC; ambiguous times and remote origins are refused", () => {
  const options = parseOptions(args)
  assert.equal(utcTimestamp(options.startNs), "2026-11-07T14:18:00.000000000Z")
  assert.equal(utcTimestamp(options.endNs), "2026-11-07T18:18:00.000000000Z")
  assert.throws(() => parseOptions(["--start", "2026-11-07T19:48:00", "--end", args[3]]), /timezone/)
  assert.throws(() => parseOptions([...args, "--url", "http://example.com:3100"]), /loopback/)
  assert.throws(() => parseOptions([...args, "--service", 'backend"}']), /service/)
  assert.throws(() => parseOptions(["--start", args[3], "--end", args[1]]), /after/)
})

test("export sorts streams, preserves nanoseconds and escapes literal ID filters", async () => {
  const options = parseOptions([...args, "--contains", 'pay_"test\\id'])
  const ns = options.startNs
  const output = []
  const count = await exportLogs(options, async url => {
    assert.equal(url.searchParams.get("query"), '{service="jd-backend_api"} |= "pay_\\"test\\\\id"')
    assert.equal(url.searchParams.get("end"), String(options.endNs - 1n))
    return response([[String(ns + 2n), "second"], [String(ns + 1n), "first"]])
  }, line => output.push(line))
  assert.equal(count, 2)
  assert.match(output[0], /14:18:00\.000000001Z.*first/)
  assert.match(output[1], /second/)
})

test("full batches with a shared boundary timestamp lose no entries and create no duplicates", async () => {
  const options = parseOptions(args)
  const start = options.startNs
  const before = Array.from({ length: 999 }, (_, index) => [String(start + BigInt(index)), `entry-${index}`])
  const output = []
  let calls = 0
  const count = await exportLogs(options, async url => {
    calls++
    if (calls === 1) return response([...before, [String(start + 999n), "boundary-first"]])
    assert.equal(url.searchParams.get("start"), String(start + 999n))
    return response([[String(start + 999n), "boundary-first"],
      [String(start + 999n), "boundary-second"], [String(start + 1000n), "last"]])
  }, line => output.push(line))
  assert.equal(count, 1002)
  assert.equal(calls, 2)
  assert.equal(output.filter(line => line.endsWith(" boundary-first\n")).length, 1)
  assert.equal(output.filter(line => line.endsWith(" boundary-second\n")).length, 1)
})

test("dense timestamps expand the batch and fail explicitly if still saturated", async () => {
  const options = parseOptions(args)
  const output = []
  const limits = []
  await assert.rejects(exportLogs(options, async url => {
    const limit = Number(url.searchParams.get("limit"))
    limits.push(limit)
    return response(Array.from({ length: limit }, (_, index) => [String(options.startNs), `entry-${index}`]))
  }, line => output.push(line)), /rather than skipping/)
  assert.deepEqual(limits, [1000, 5000])
  assert.equal(output.length, 0)
})

test("empty results are valid; storage/API failures and invalid result types are visible", async () => {
  const options = parseOptions(args)
  assert.equal(await exportLogs(options, async () => response([])), 0)
  await assert.rejects(exportLogs(options, async () => ({ ok: false, status: 503 })), /503/)
  await assert.rejects(exportLogs(options, async () => ({ ok: true, json: async () => ({ status: "success",
    data: { resultType: "matrix" } }) })), /invalid response/)
})
