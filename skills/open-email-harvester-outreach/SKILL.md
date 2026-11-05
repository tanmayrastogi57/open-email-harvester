---
name: open-email-harvester-outreach
description: Manage the local Open Email Harvester outreach CRM, including Gmail connection status, metadata-only synchronization, reconciliation, replies, follow-ups, and privacy-safe exports.
---

# Open Email Harvester Outreach

Use this skill when the user asks about who they contacted, replies, follow-ups, delivery failures, job metadata, or the local Outreach CRM.

## Workflow

1. Check `gmail_connection_status` before claiming that Gmail is connected.
2. For current mailbox state, call `sync_gmail_outreach` when the local Gmail OAuth connection is available. If it is not connected, use the AI client's Gmail connector to search sent mail and replies, then pass metadata-only messages to `reconcile_outreach_from_gmail`.
3. Use `outreach_summary` for counts and `list_outreach` for records. Use `set_outreach_followup` for the next planned date and `record_outreach_event` for a completed action.
4. Preserve Gmail `messageId` and `threadId`; reconciliation is idempotent and uses them to correct duplicate or stale records.
5. Store metadata only: recipient, role, company, source, subject, timestamps, labels, IDs, status, tags, and notes. Do not store Gmail bodies, OAuth tokens, passwords, or private contact data.

## Boundaries

- The tracker does not send email. Sending requires a separate, explicit mail action.
- Do not claim that data is current unless a sync was completed or the user supplied fresh Gmail results.
- Do not scrape or infer private/personal recruiter addresses. Track only addresses the user is allowed to process.
- If direct Gmail sync fails, report the connection or API error and do not overwrite existing records with guesses.

## Reconciliation input

`reconcile_outreach_from_gmail` accepts normalized messages such as:

```json
{
  "messageId": "gmail-message-id",
  "threadId": "gmail-thread-id",
  "direction": "sent",
  "email": "recruiter@example.com",
  "subject": "Application: Python Developer",
  "at": "2026-11-05T10:00:00Z"
}
```

For replies, use `direction: "inbound"` and the same `threadId`; never include the message body unless the user explicitly requests a separate, authorized reading task.
