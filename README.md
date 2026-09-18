# UMA Management Read API

Professional, read-only gateway for sharing the same Management dashboard and report data produced by the UMA Finance system.

## Version 1.2.0

This version improves both Render connectivity and the Management viewer:

- Professional responsive Management dashboard at `/`.
- Live connection status for the upstream UMA Finance backend.
- `FINANCE_API_BASE_URL` may now be either the Finance root URL or the `/api` URL.
- Clear diagnostics for localhost, DNS, connection, credential, and Management-role failures.
- Responsive KPI cards, budget position, spend trend, CAPEX/OPEX, top areas, workflow, payables, SLA, period close, and recent requests.
- No financial write operations are exposed.

## Architecture

```text
External viewer / another application
        |
        | X-API-Key
        v
UMA Management Read API (Render)
        |
        | private Management service credentials / JWT
        v
UMA Finance Backend
        |
        v
Existing Management dashboard + report logic
```

The Management gateway does **not** connect directly to MongoDB and does not duplicate Finance calculations.

## Why "Unable to reach UMA Finance API" happens

The Management service can be healthy while the Finance backend is unreachable.

Most commonly on Render, `FINANCE_API_BASE_URL` was configured as `localhost` or the main Finance backend has not been deployed publicly/private-network reachable.

Use either of these forms:

```text
FINANCE_API_BASE_URL=https://your-finance-backend.onrender.com
```

or:

```text
FINANCE_API_BASE_URL=https://your-finance-backend.onrender.com/api
```

Version 1.2.0 normalizes both automatically.

Do **not** use this on Render:

```text
FINANCE_API_BASE_URL=http://localhost:5000
```

`localhost` would refer to the Management Render container itself, not your UMA computer.

## Required Finance service account

Create a dedicated active user in the main Finance system:

```text
Name: Management View API
Role: Management
```

Use a strong unique password. The external API consumer must never receive this account password.

## Local setup

```bash
npm install
```

Copy the environment template:

```powershell
Copy-Item .env.example .env
```

Generate a viewer API key:

```bash
npm run generate:key
```

Start:

```bash
npm start
```

Open:

```text
http://localhost:8088/
```

## Render deployment

Push this folder to its own GitHub repository, then create a Render Blueprint or Web Service.

`render.yaml` is already included.

Required Render environment variables:

```text
FINANCE_API_BASE_URL=https://YOUR-FINANCE-BACKEND
FINANCE_SERVICE_EMAIL=management-view-api@uma.edu.pe
FINANCE_SERVICE_PASSWORD=<strong dedicated password>
VIEWER_API_KEYS=<generated viewer key>
```

The following are already declared by `render.yaml`:

```text
NODE_ENV=production
FINANCE_REQUIRED_ROLE=MANAGEMENT
RATE_LIMIT_PER_MINUTE=120
CACHE_TTL_SECONDS=30
REQUEST_TIMEOUT_MS=10000
```

Render supplies `PORT` automatically.

### Important

If the main UMA Finance backend is not deployed/reachable from Render, this Management API cannot display live data. Deploy the Finance backend first or provide a reachable internal/public URL.

## Health and diagnostics

Gateway health:

```text
GET /health
```

This only confirms that the Management service itself is running.

Full readiness:

```text
GET /ready
```

When connected:

```json
{
  "status": "ready",
  "service": "uma-management-read-api",
  "readOnly": true,
  "upstream": {
    "reachable": true,
    "authenticated": true,
    "role": "MANAGEMENT"
  }
}
```

When not connected, `/ready` returns a safe `hint` explaining the likely configuration problem without exposing passwords or tokens.

## Read-only Management endpoints

All Management endpoints require `X-API-Key` or `Authorization: Bearer <viewer-key>`.

```text
GET /api/v1/management/dashboard
GET /api/v1/management/report
GET /api/v1/management/filters
GET /api/v1/management/snapshot
```

Recommended endpoint for another visualization project:

```http
GET /api/v1/management/snapshot?period=2026-09
X-API-Key: YOUR_VIEWER_KEY
```

Supported report filters:

```text
period
dateFrom
dateTo
currency
requestType
area
costCenter
project
```

## Security model

The API gateway accepts only:

```text
GET
HEAD
OPTIONS
```

It does not expose routes for:

- approvals
- request edits
- budget decisions
- accounting posting
- BBVA generation
- payment confirmation
- reconciliation
- supplier editing
- user administration
- master-data modification

The viewer API key is separate from the private Finance Management credentials.

## Browser/CORS access

The built-in viewer calls the API from the same Render origin and needs no extra CORS configuration.

If another browser application calls this gateway directly, set exact origins in:

```text
ALLOWED_ORIGINS=https://other-dashboard.example.com
```

For a public/browser application, prefer storing the viewer API key on that application's backend instead of embedding a permanent key in downloadable JavaScript.

## What to share with another person

Share only:

1. The Render Management API URL.
2. A viewer API key.
3. `/openapi.yaml`.

Never share:

- `FINANCE_SERVICE_PASSWORD`
- Finance JWTs
- MongoDB credentials
- Render secret values
