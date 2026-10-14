# Render Centralised Dashboard — RenderDesk

A personal, frontend-only control center for Render services across multiple accounts.

## Features implemented
- Connect multiple Render accounts by pasting a Render API key; validates the key and imports services.
- Dashboard overview, service search and filters, account grouping, service detail modal.
- Recent application/request/build logs via the Render Logs API (last hour, up to 100 entries, searchable).
- Environment variable viewer/editor: list direct service variables, mask/reveal values, add/update/delete individual variables. Linked environment-group variables are not included.
- Deployment history, trigger latest deploy, deploy with cleared cache, and restart supported services.
- Encrypted local credential vault: API keys are encrypted with AES-256-GCM using a key derived from a passphrase with PBKDF2-SHA-256 (310,000 iterations). The encrypted ciphertext is saved in this browser's localStorage, while the passphrase and decrypted keys stay in memory until you lock/close/refresh the page.
- No application server or database.

## Critical security notes
- There is no such thing as “zero risk of leak” for API keys used by a browser. Encryption protects the saved vault at rest, but a compromised browser/device, malicious extension, or script injection on the site could access keys after the vault is unlocked.
- Use a strong, unique vault passphrase (12+ characters; a longer passphrase is better), serve only over HTTPS or localhost, keep the browser updated, and do not share screenshots containing secret values.
- If you forget the passphrase, the encrypted vault cannot be recovered. Deleting the vault clears the saved ciphertext.
- This is local encryption, **not website authentication**. A public static site can still be opened by other people; they will not have your passphrase, but a public deployment is not equivalent to private hosting.
- The Render API may reject browser-originated requests due to CORS. If the API blocks them, a frontend-only app cannot bypass that browser security rule. The app will report the error; the safe alternatives are running locally or adding a carefully secured local-only proxy.
- Environment variable values are shown only as returned by Render's API. The API may mask or omit some secrets. Environment changes may require a deployment before they take effect. Each edit/delete and deploy/restart action has a confirmation step.
- Log access requires a workspace owner ID on the service record. If Render does not include it in the service response, logs will show an actionable error instead of guessing an owner ID.

## Run locally
Requirements: Node.js 20+ and npm.

```bash
git clone https://github.com/Tanushh18/Render-centralised-dashboard.git
cd Render-centralised-dashboard
npm install
npm run dev
```

Open the local Vite URL shown in the terminal (normally http://localhost:5173). On first run, create your local vault passphrase. Add each Render account using its own API key.

## Deploy as a static site
Create a Render Static Site connected to this repository:
- Build command: `npm install && npm run build`
- Publish directory: `client/dist`

No backend service is required. Use HTTPS. Because this repository is public, avoid embedding keys in source code or build-time environment variables. For better privacy, prefer local use; a public static URL is still publicly reachable.

## API references
- [Render API — list services](https://api-docs.render.com/reference/list-services)
- [Render API — list logs](https://api-docs.render.com/reference/list-logs)
- [Render API — environment variables](https://api-docs.render.com/reference/get-env-vars-for-service)
- [Render API — list deployments](https://api-docs.render.com/reference/list-deploys)
- [Render API — trigger deploy](https://api-docs.render.com/reference/create-deploy)
- [Render API — restart service](https://api-docs.render.com/reference/restart-service)
