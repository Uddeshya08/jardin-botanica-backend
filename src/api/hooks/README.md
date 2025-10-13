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
   - **Headers** (optional): You can add authentication headers if needed
   - **Content type**: application/json
   - **Triggers**: Select the following events:
     - Entry: publish, unpublish, auto_save, archive, unarchive, delete
     - Asset: publish, unpublish, archive, unarchive, delete
   - **Filters** (optional): You can filter by content type if needed

5. Save the webhook
6. Test it by publishing an entry in Contentful

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

