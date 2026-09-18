# UMA Management Read API

Separate, read-only API gateway for sharing the same Management dashboard/report data that already exists in UMA Finance.

## What changed in the Render-ready version

- `/` now opens a built-in Management API viewer instead of returning 404.
- `/favicon.ico` returns 204 instead of creating noisy 404 logs.
- `/openapi.yaml` is publicly available for integration documentation.
- `render.yaml` is included for Render Blueprint deployment.
- Same-origin browser calls are allowed automatically; external browser origins still require `ALLOWED_ORIGINS`.
- The service continues to expose only read-only Management GET endpoints.

## Architecture

```text
External viewer / other project
        |
        | X-API-Key
        v
UMA Management Read API (Render)
        |
        | private Management service credentials / JWT
        v
Existing UMA Finance Backend
        |
        v
Management dashboard + report services
```

## Important before Render deployment

`FINANCE_API_BASE_URL=http://localhost:5000/api` will NOT work on Render. Render cannot reach the backend running on your Windows PC.

The existing Finance backend must be reachable from Render, for example:

```text
https://finance-api.your-domain.com/api
```

or, if the Finance backend is also on Render, use its public HTTPS URL or appropriate private service address.

## Local setup

```bash
npm install
```

Copy environment variables:

```powershell
Copy-Item .env.example .env
```

Generate an external API key:

```bash
npm run generate:key
```

Configure `.env`, then:

```bash
npm start
```

Open:

```text
http://localhost:8088/
```

Health endpoints:

```text
GET /health
GET /ready
```

`/health` proves this gateway is running. `/ready` additionally verifies that the UMA Finance backend is reachable.

## Read-only endpoints

All endpoints below require `X-API-Key` or `Authorization: Bearer <viewer-key>`.

```text
GET /api/v1/management/dashboard
GET /api/v1/management/report
GET /api/v1/management/filters
GET /api/v1/management/snapshot
```

The snapshot endpoint is easiest for another dashboard:

```http
GET /api/v1/management/snapshot?period=2026-09
X-API-Key: YOUR_VIEWER_KEY
```

Optional report filters:

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

## Render deployment - recommended method

### 1. Push this project to its own GitHub repository

From the extracted project folder:

```bash
git init
git add .
git commit -m "UMA Management Read API - Render ready"
git branch -M main
git remote add origin https://github.com/YOUR_USER/uma-management-read-api.git
git push -u origin main
```

Do not commit `.env`.

### 2. Create the Render service

In Render:

1. Choose **New > Blueprint** if you want Render to use `render.yaml`, or **New > Web Service** and select the repository.
2. Build command: `npm install`
3. Start command: `npm start`
4. Health check path: `/health`

### 3. Add Render environment variables

Required:

```text
FINANCE_API_BASE_URL=https://YOUR-FINANCE-BACKEND/api
FINANCE_SERVICE_EMAIL=management-view-api@uma.edu.pe
FINANCE_SERVICE_PASSWORD=<strong dedicated password>
VIEWER_API_KEYS=<long generated key>
FINANCE_REQUIRED_ROLE=MANAGEMENT
NODE_ENV=production
```

Optional:

```text
ALLOWED_ORIGINS=https://the-other-dashboard.example.com
RATE_LIMIT_PER_MINUTE=120
CACHE_TTL_SECONDS=30
REQUEST_TIMEOUT_MS=10000
```

Render supplies `PORT` automatically. Do not hardcode a Render port.

### 4. Test after deployment

Suppose Render gives:

```text
https://uma-management-read-api.onrender.com
```

Open:

```text
https://uma-management-read-api.onrender.com/
```

You should see the built-in viewer.

Check gateway health:

```text
https://uma-management-read-api.onrender.com/health
```

Then check upstream readiness:

```text
https://uma-management-read-api.onrender.com/ready
```

Expected `/ready` result when the Finance API credentials and URL are correct:

```json
{
  "status": "ready",
  "upstream": {
    "status": "ok"
  }
}
```

If `/health` works but `/ready` returns 503, the gateway itself is deployed correctly but Render cannot authenticate to/reach the main UMA Finance backend.

## Sharing with another person

Give the consumer only:

1. Render API URL
2. Viewer API key
3. `https://YOUR-RENDER-URL/openapi.yaml`

Do not share:

- Finance service-account password
- Finance JWT
- MongoDB connection string
- Render secret environment values

Example JavaScript from another backend:

```js
const response = await fetch(
  "https://uma-management-read-api.onrender.com/api/v1/management/snapshot?period=2026-09",
  {
    headers: {
      "X-API-Key": process.env.UMA_MANAGEMENT_API_KEY
    }
  }
);

const body = await response.json();
```

## Browser access and CORS

The viewer hosted by this API can call the API on the same origin automatically.

If a different browser application calls the API directly, add its exact URL to `ALLOWED_ORIGINS`, for example:

```text
ALLOWED_ORIGINS=https://partner-dashboard.onrender.com,https://management.example.edu.pe
```

For a public application, prefer server-to-server use because browser API keys can be inspected by users.

## Read-only guarantees

The gateway exposes no Finance mutation endpoints. It does not expose request creation/editing, approvals, Budget actions, Accounting posting, Treasury actions, BBVA generation, payment confirmation, reconciliation, user management, or master-data editing.

Only `GET`, `HEAD`, and `OPTIONS` are accepted below `/api/v1`.

## Production security

- Use a dedicated Finance Management service account.
- Use a unique long `VIEWER_API_KEYS` value per consumer where possible.
- Keep Finance credentials only in Render environment variables.
- Restrict `ALLOWED_ORIGINS` if browser consumption is needed.
- Rotate a viewer key immediately if it is exposed publicly.
- HTTPS is provided by Render.
- Do not put `.env` into GitHub.
