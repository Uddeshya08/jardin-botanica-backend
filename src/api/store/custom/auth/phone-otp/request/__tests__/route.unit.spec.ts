import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import { POST } from "../route"

describe("account phone OTP requests", () => {
  const signupMessage =
    "This number isn't linked to an account yet. Please sign up first to continue with OTP."

  function setup(customers: unknown[] = [], rateLimited = false) {
    const cache = {
      get: jest.fn().mockResolvedValue(rateLimited),
      set: jest.fn().mockResolvedValue(undefined),
    }
    const graph = jest.fn().mockResolvedValue({ data: customers })
    const resolve = jest.fn((key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return { info: jest.fn() }
      if (key === ContainerRegistrationKeys.QUERY) return { graph }
      if (key === Modules.CACHE) return cache
      throw new Error(`Unexpected service: ${key}`)
    })
    const req = {
      body: { phone: "+919876543210" },
      scope: { resolve },
    } as unknown as MedusaRequest<{ phone: string }>
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as MedusaResponse
    return { req, res, graph, resolve }
  }

  it("returns signup guidance for an unregistered number without sending an OTP", async () => {
    const { req, res, resolve } = setup()
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: signupMessage })
    expect(resolve).not.toHaveBeenCalledWith(Modules.AUTH)
  })

  it("returns signup guidance for a guest customer without an account", async () => {
    const { req, res } = setup([
      { id: "cus_guest", email: "guest@example.com", phone: "+919876543210", has_account: false },
    ])
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: signupMessage })
  })

  it("keeps rate limiting ahead of account lookup", async () => {
    const { req, res, graph } = setup([], true)
    await POST(req, res)
    expect(res.status).toHaveBeenCalledWith(429)
    expect(graph).not.toHaveBeenCalled()
  })
})
