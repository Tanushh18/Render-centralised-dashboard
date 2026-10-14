# Render Centralised Dashboard

A browser-only, personal control center for seeing services across multiple Render accounts.

## Current MVP
- Connect multiple Render accounts by pasting each account's Render API key.
- Validate the key against Render's services endpoint and fetch up to 100 services.
- View a polished overview with service count, suspended count, account list, search, account/type filters, and service details.
- Open a service in the official Render dashboard.
- API keys stay in JavaScript memory only: they are not written to localStorage, cookies, a database, or this repository. Refreshing/closing the page clears them.
- No application server or application-level login is required for this static MVP.

## Important browser-only limitation
A frontend cannot make a secret truly secure: a key used by the browser is accessible to that browser session and can be exposed by a compromised device, malicious extension, or frontend script injection. This app minimizes persistence by keeping keys in memory and making requests directly from the browser to Render.

Browser requests may also be blocked if the Render API does not allow cross-origin requests from the page. If the browser reports a CORS/network error, there is no safe frontend-only workaround; use a local-only proxy or a small secured backend. Do not paste API keys into public issues, screenshots, or chat messages.

The MVP does **not yet** fetch logs, edit environment variables, or trigger deployments. It links to the official Render dashboard for those operations. These features should only be added after verifying the relevant Render API endpoints and browser access.

## Run locally
Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Vite prints the local URL (normally http://localhost:5173).

## Deploy as a static site
Create a Render **Static Site** connected to this repository:
- **Build command:** `npm install && npm run build`
- **Publish directory:** `client/dist`

No backend service is required for the current MVP. Since this repository is public, do not commit credentials. For a truly private dashboard, keep the static site unlisted and preferably use private network/access restrictions; a URL alone is not authentication.

## Roadmap
1. Verify browser connectivity to Render API in the target deployment.
2. Add deploy history and log access where supported.
3. Add env-variable management only with explicit confirmation, masked values, and strong safeguards.
4. Add optional local-only proxy mode if CORS prevents direct browser API calls.
