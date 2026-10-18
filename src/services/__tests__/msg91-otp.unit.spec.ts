import {
  getPhoneLookupVariants,
  Msg91OtpClient,
  Msg91OtpError,
  normalizePhoneNumber,
} from "../msg91-otp"

describe("MSG91 OTP service", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("normalizePhoneNumber", () => {
    it.each([
      ["98765 43210", "919876543210"],
      ["+91 98765-43210", "919876543210"],
      ["0091 98765 43210", "919876543210"],
      ["09876543210", "919876543210"],
    ])("normalizes %s", (input, expected) => {
      expect(normalizePhoneNumber(input)).toBe(expected)
    })

    it("rejects invalid input", () => {
      expect(() => normalizePhoneNumber("not-a-phone")).toThrow(
        "Enter a valid mobile phone number"
      )
    })
  })

  it("generates lookup variants for existing customer phone formats", () => {
    expect(getPhoneLookupVariants("919876543210")).toEqual([
      "919876543210",
      "+919876543210",
      "9876543210",
      "09876543210",
    ])
  })

  it("sends an OTP using the configured MSG91 template", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ type: "success", request_id: "req_123" }),
        { status: 200 }
      )
    )
    const client = new Msg91OtpClient({
      authKey: "auth-key",
      templateId: "template-id",
      otpExpiryMinutes: 5,
      otpLength: 6,
    })

    await expect(client.sendOtp("919876543210")).resolves.toEqual({
      requestId: "req_123",
    })

    const [url, request] = fetchMock.mock.calls[0]
    const parsedUrl = new URL(String(url))

    expect(parsedUrl.pathname).toBe("/api/v5/otp")
    expect(parsedUrl.searchParams.get("template_id")).toBe("template-id")
    expect(parsedUrl.searchParams.get("mobile")).toBe("919876543210")
    expect(request).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ authkey: "auth-key" }),
    })
  })

  it("verifies an OTP through MSG91", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ type: "success", message: "OTP verified success" }),
        { status: 200 }
      )
    )
    const client = new Msg91OtpClient({
      authKey: "auth-key",
      templateId: "template-id",
    })

    await expect(
      client.verifyOtp("919876543210", "123456")
    ).resolves.toBeUndefined()

    const parsedUrl = new URL(String(fetchMock.mock.calls[0][0]))
    expect(parsedUrl.pathname).toBe("/api/v5/otp/verify")
    expect(parsedUrl.searchParams.get("mobile")).toBe("919876543210")
    expect(parsedUrl.searchParams.get("otp")).toBe("123456")
  })

  it("rejects logical MSG91 errors even when HTTP status is 200", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ type: "error", message: "Invalid OTP" }), {
        status: 200,
      })
    )
    const client = new Msg91OtpClient({
      authKey: "auth-key",
      templateId: "template-id",
    })

    await expect(
      client.verifyOtp("919876543210", "000000")
    ).rejects.toEqual(new Msg91OtpError("Invalid OTP"))
  })
})
