# License Manager — AI Agent Business Kit

This guide explains how to issue, inspect, and revoke licenses after a customer pays.

---

## License Key Format

```
AIKIT-XXXXX-XXXXX
```

- Prefix: `AIKIT`
- Two groups of 5 uppercase alphanumeric characters
- Example: `AIKIT-K7M2P-R9XQN`

---

## KV Data Schema

Each key in `LICENSES_KV` maps a license key string to a JSON object:

```json
{
  "email":       "customer@example.com",
  "orderId":     "AIKIT1234567",
  "activatedAt": "2025-01-15T08:30:00.000Z",
  "expiresAt":   null,
  "revoked":     false,
  "plan":        "lifetime"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `email` | string | Customer email from checkout |
| `orderId` | string | Order ID from payment (matches ORDERS_KV) |
| `activatedAt` | ISO 8601 string | When the license was created |
| `expiresAt` | ISO 8601 string or `null` | `null` = lifetime license |
| `revoked` | boolean | Set to `true` to block access |
| `plan` | string | `"lifetime"`, `"annual"`, `"monthly"` |

---

## Issuing a License (After Payment)

### Step 1 — Generate a random key

Use this Node snippet to generate a properly formatted key:

```js
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  const seg = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `AIKIT-${seg()}-${seg()}`;
}
console.log(generateLicenseKey());
// Example output: AIKIT-K7M2P-R9XQN
```

### Step 2 — Store in LICENSES_KV via wrangler

```bash
npx wrangler kv:key put \
  --namespace-id=YOUR_LICENSES_KV_ID \
  "AIKIT-K7M2P-R9XQN" \
  '{"email":"customer@example.com","orderId":"AIKIT1234567","activatedAt":"2025-01-15T08:30:00.000Z","expiresAt":null,"revoked":false,"plan":"lifetime"}'
```

For a **1-year expiry** (annual plan), set `expiresAt` to one year from now:

```bash
# Calculate expiry date (example: 2026-01-15)
npx wrangler kv:key put \
  --namespace-id=YOUR_LICENSES_KV_ID \
  "AIKIT-A1B2C-D3E4F" \
  '{"email":"customer@example.com","orderId":"AIKIT9876543","activatedAt":"2025-01-15T08:30:00.000Z","expiresAt":"2026-01-15T08:30:00.000Z","revoked":false,"plan":"annual"}'
```

### Step 3 — Send key to customer

Email the customer their license key:

```
Subject: Your AI Agent Business Kit License Key

Hi [Name],

Your purchase is confirmed! Here is your license key:

  AIKIT-K7M2P-R9XQN

Keep this key safe — you will need it to connect the kit to Claude.

Setup instructions are attached (or link to claude-desktop-setup.md).

Thank you!
```

---

## Automating License Issuance

To issue licenses automatically when payment is confirmed, add this logic to the payment worker (`worker/worker.js`) inside the webhook handler, after marking the order as paid:

```js
// Inside the POST /webhook handler, after env.ORDERS_KV.put(...)

// 1. Generate license key
function generateLicenseKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `AIKIT-${seg()}-${seg()}`;
}

const licenseKey = generateLicenseKey();
const licenseData = JSON.stringify({
  email: body.email ?? '',        // include email in webhook payload if available
  orderId: orderId,
  activatedAt: new Date().toISOString(),
  expiresAt: null,                // lifetime
  revoked: false,
  plan: 'lifetime',
});

// 2. Store in LICENSES_KV
await env.LICENSES_KV.put(licenseKey, licenseData);

// 3. Store reverse lookup: orderId → licenseKey (for support lookups)
await env.LICENSES_KV.put(`order:${orderId}`, licenseKey);

// 4. TODO: Send email via your preferred email API (Resend, SendGrid, etc.)
// await sendLicenseEmail(body.email, licenseKey);
```

> Note: Both workers (`aikit-payment` and `aikit-mcp`) need to bind the same `LICENSES_KV` namespace ID for this to work seamlessly.

---

## Looking Up a License

```bash
# Get license by key
npx wrangler kv:key get \
  --namespace-id=YOUR_LICENSES_KV_ID \
  "AIKIT-K7M2P-R9XQN"

# Get key by order ID (if you stored the reverse lookup)
npx wrangler kv:key get \
  --namespace-id=YOUR_LICENSES_KV_ID \
  "order:AIKIT1234567"
```

---

## Revoking a License

To block a customer's access immediately, set `revoked: true`:

```bash
npx wrangler kv:key put \
  --namespace-id=YOUR_LICENSES_KV_ID \
  "AIKIT-K7M2P-R9XQN" \
  '{"email":"customer@example.com","orderId":"AIKIT1234567","activatedAt":"2025-01-15T08:30:00.000Z","expiresAt":null,"revoked":true,"plan":"lifetime"}'
```

The MCP server will immediately return a 401 error for any request using that key.

---

## Listing All Licenses

```bash
npx wrangler kv:key list \
  --namespace-id=YOUR_LICENSES_KV_ID
```

This returns all stored keys (license keys + reverse lookup keys starting with `order:`).

---

## Creating the KV Namespace

Run once before first deployment:

```bash
# Production namespace
npx wrangler kv:namespace create LICENSES_KV

# Preview namespace (for wrangler dev)
npx wrangler kv:namespace create LICENSES_KV --preview
```

Copy the IDs into `wrangler.toml`.

---

## Security Notes

- License keys are stored in plaintext in KV — they are bearer tokens. Treat them like passwords.
- Do NOT log license keys in worker console output.
- The `X-License-Key` header is sent over HTTPS (Cloudflare terminates TLS) — it is safe in transit.
- One license = one user. The server does not enforce concurrent session limits (Cloudflare Workers are stateless), but you can add IP-based rate limiting via Cloudflare Rules if needed.
