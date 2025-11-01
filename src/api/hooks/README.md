# Webhooks

This directory contains webhook endpoints for third-party integrations.

## Contentful Webhook

The `/hooks/contentful` endpoint receives webhooks from Contentful when content is published, updated, or deleted.

### Setup in Contentful

1. Go to your Contentful space
2. Navigate to **Settings → Webhooks**
3. Click **Add Webhook**
4. Configure the webhook:
   - **Name**: Medusa Sync
   - **URL**: `https://your-domain.com/hooks/contentful` (or `http://localhost:9000/hooks/contentful` for development)
   - **HTTP method**: POST
   - **Content type**: application/json
   - **Triggers**: Select the following events:
     - Entry: publish, unpublish, auto_save, archive, unarchive, delete
     - Asset: publish, unpublish, archive, unarchive, delete
   - **Filters** (optional): You can filter by content type if needed

5. **Enable Request Verification (REQUIRED):**
   - In the webhook settings, go to the **Settings** tab
   - Enable **Request verification**
   - A signing secret will be generated. **Copy this secret immediately**, as it won't be accessible again
   - Store this secret securely (e.g., in your environment variables)

6. Save the webhook
7. Test it by publishing an entry in Contentful

### Environment Variables

**Required:**
- `CONTENTFUL_WEBHOOK_SECRET`: The webhook signing secret from Contentful (obtained from Settings → Webhooks → Request verification)

**Note:** Without `CONTENTFUL_WEBHOOK_SECRET` configured, the webhook endpoint will reject all requests with a 500 error. Signature verification is **mandatory** for security and cannot be bypassed.

### Local Development

For local development, you'll need to expose your local server to the internet so Contentful can send webhooks to it. You can use tools like:

- **ngrok**: `ngrok http 9000`
- **localtunnel**: `lt --port 9000`
- **cloudflare tunnel**: `cloudflared tunnel --url http://localhost:9000`

Then use the generated URL in your Contentful webhook configuration.

### Webhook Payload

Contentful sends a JSON payload with information about the event:

```json
{
  "sys": {
    "type": "Entry",
    "id": "entry-id",
    "contentType": {
      "sys": {
        "id": "product"
      }
    },
    "environment": {
      "sys": {
        "id": "master"
      }
    }
  },
  "fields": {
    // Entry fields
  }
}
```

The medusa-plugin-contentful automatically handles the sync based on these events.

### Security: Signature Verification

**Important:** This webhook endpoint implements HMAC-SHA256 signature verification to ensure requests are authentic and come from Contentful. All incoming requests are verified using the following headers:

- `X-Contentful-Signature`: The HMAC-SHA256 signature of the request
- `X-Contentful-Signed-Headers`: The headers used in the signature calculation
- `X-Contentful-Timestamp`: The timestamp of the request

**Verification Process:**
1. The endpoint extracts the signature headers from the incoming request
2. It calculates the expected signature using the webhook secret and request data
3. It compares the calculated signature with the provided signature using constant-time comparison
4. Requests with invalid or missing signatures are rejected with a 403 Forbidden status

**Failed Verification:**
- If signature headers are missing → 403 Forbidden
- If signature verification fails → 403 Forbidden
- If `CONTENTFUL_WEBHOOK_SECRET` is not configured → 500 Internal Server Error

This verification prevents unauthorized webhook requests and ensures the integrity of the webhook payload.

