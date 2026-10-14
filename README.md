# Render Centralised Dashboard

A personal, single-operator control center for services hosted across multiple Render accounts.

## Goals
- Connect multiple Render accounts using individual Render API keys.
- Display services from all connected accounts in one polished dashboard.
- Inspect service status, regions, instance types, URLs, deploys, events, and available metrics.
- Inspect service-specific logs and deployment history where supported by the Render API.
- Provide a careful environment-variable editor with masked values and confirmation before changes.
- Offer explicitly confirmed service actions where the API supports them.
- Make setup easy: paste an API key, validate it, name the account, and sync services.

## Security model
This repository starts publicly visible unless its owner changes repository visibility. Do not deploy an unauthenticated control plane with Render API keys to a public URL. Render API keys are powerful credentials. Keep them on the server, never return them to the browser, encrypt stored credentials using a deployment secret, redact secrets from logs, and add a private-access gate before enabling control actions. A private URL by itself is not authentication.

## Planned stack
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Storage: SQLite for simple personal deployment; encrypted provider credentials
- UI: responsive dark operations console with account switcher, overview cards, searchable service table, service details, deploys, logs, environment variables, and settings

## Development
Configure environment variables from `.env.example`; never commit a real API key or encryption key.
