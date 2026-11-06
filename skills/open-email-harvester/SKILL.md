---
name: open-email-harvester
description: Use the Open Email Harvester extension and local MCP/REST bridge to extract contacts, manage outreach metadata, synchronize Gmail metadata, and operate the local dashboard safely.
---

# Open Email Harvester

Use this skill when the user asks to scan a page, save or search contacts, use the Open Email Harvester MCP server, inspect the local Outreach CRM, synchronize Gmail metadata, or manage the local dashboard and bridge.

## Operating model

- The browser extension keeps contacts in browser-local storage. Bridge sync is optional and must use a localhost URL.
- The REST bridge serves the dashboard at `/outreach/dashboard` and binds to `127.0.0.1` by default.
- When the MCP entrypoint (`server/mcp.js`) starts, it checks the bridge health endpoint and starts `server/bridge.js` on demand. On Windows, the optional per-user task installed by `npm run autostart:install` starts the bridge at sign-in; the extension can then open the dashboard on Chrome startup.
- Treat the MCP tool schemas and the implementation in `server/mcp.js`, `server/host.js`, and `server/outreach.js` as the source of truth. Do not invent tool names or fields.

## Contact workflow

Use the narrowest tool that matches the request:

- `list_contacts` / `search_contacts` to inspect saved contacts; use `add_contacts`, `tag_contact`, and `remove_contact` for explicit data changes.
- `extract_from_text` for user-provided page text or HTML; set `save: true` only when the user asks to persist the result.
- `validate_email`, `list_domains`, and `export_contacts` for offline checks, grouping, and exports.

When scanning through the extension, preserve the source URL, page title, domain, and extraction validity where available. Do not claim that a page was scanned unless the extension or supplied content was actually processed.

## Outreach and Gmail workflow

1. Call `gmail_connection_status` before claiming that Gmail is connected.
2. For current mailbox state, call `sync_gmail_outreach` when the local Gmail OAuth connection is available. Otherwise use the user’s authorized Gmail connector to obtain metadata and pass only normalized records to `reconcile_outreach_from_gmail`.
3. Use `outreach_summary` for counts and `list_outreach` for records. Use `upsert_outreach` for job metadata, `record_outreach_event` for sent/replied/follow-up events, and `set_outreach_followup` for the next planned date.
4. Preserve Gmail `messageId` and `threadId`. Reconciliation is idempotent and uses those IDs to correct duplicates or stale recipient, subject, role, and status fields.
5. Sync before answering questions about recent sent mail, replies, or follow-ups. State the sync time or say that the data is not current if sync was not completed.

## Privacy and authorization boundaries

- Store metadata only: recipient address the user is allowed to process, role, company, source URL, subject, timestamps, labels, Gmail IDs, status, tags, and notes.
- Never store or expose OAuth tokens, passwords, API secrets, or full Gmail message bodies through this skill.
- Do not scrape, infer, or provide private/personal recruiter addresses. Use public professional contact details or addresses the user has explicitly supplied and is allowed to process.
- The tracker does not send email. Sending, replying, or contacting a person requires a separate explicit mail action and confirmation at the point of sending.
- Do not overwrite existing outreach records with guesses when Gmail or the bridge is unavailable; report the error and preserve the existing data.

## Code changes

When modifying the extension or server, preserve Manifest V3 service-worker compatibility, localhost-only defaults, metadata-only Gmail reconciliation, and the dependency-free stdio MCP protocol. Run `npm test` and `npm run lint`; run `npm run lint:ext` as an additional check and report its result separately if an existing Firefox compatibility warning/error remains.
