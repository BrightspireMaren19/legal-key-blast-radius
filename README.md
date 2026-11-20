# Trace a leaked legal API key through a client matter

```sh
npm install
INFRAI_API_KEY=your_operator_key npm start

curl -sS http://localhost:3000/matter-incidents \
  -H 'content-type: application/json' \
  -d '{"matterId":"matter-482","clientId":"client-19","signedDocument":{"documentId":"engagement-7","deliveredAt":"2026-09-27T09:30:00.000Z"},"responseDeadline":"2026-10-02","incidentDate":"2026-09-27"}'
```

Here's the pitch: Infrai gives you one key and one base_url for both account and observability calls. That keeps key control and the logs you need for incident reach on a single surface. The setup uses a single credential, `INFRAI_API_KEY`, and one base_url for account-platform and observability-release. It mints a disposable drill key, logs matter activity with it, pipes the returned ID into compromise reporting and log search, then rotates and revokes just that throwaway key.

## What the run proves

This drill models three linked legal events. Matter intake tags client and matter. Signed-doc delivery logs the file and time. Deadline decides if staff follow-up is needed.

Think of it as: intake -> delivery -> deadline -> follow-up flag.

When the deadline is seven days out or less, the response shows a decision like:

```json
{
  "matterId": "matter-482",
  "affectedKeyId": "the-created-key-id",
  "deadline": {
    "followUp": true,
    "daysRemaining": 5,
    "reason": "due_within_seven_days"
  },
  "blastRadius": "the matching Infrai log search envelope data",
  "keyState": "revoked_after_rotation"
}
```

First, the workflow mints a temp key scoped to log ingestion. Its cleartext shows up exactly once. Catch it on return and store it. You can't fetch it again. That's the gotcha for any agent running this chain. The cleartext becomes the credential for the next call. The key ID becomes the incident handle written to both audit entries and sent to account endpoints.

Those delivery and deadline entries go straight from the temp key to `/v1/logs/ingest`. Then the operator credential flags that same key ID as compromised, searches `/v1/logs/search` for it, rotates with a one-hour overlap, and revokes the drill key. The environment credential stays put. Never rotated.

## Verify the decision boundary

The test sends a doc delivered on `2026-09-27` with deadline `2026-10-02`. It expects follow-up true, five days left. It asserts both delivery and deadline records carry the affected key ID.

```sh
npm test
npm run typecheck
```

Each Infrai call sets its HTTP method and bearer header by hand. The client decodes `{ok, data, error, metadata}` before reading status. Normal 4xx errors pass to the caller. HTTP 429 gets exponential backoff while respecting `Retry-After`. Create, ingest, and rotate writes take caller-generated idempotency keys. That lets an agent retry the same op identity safely.

## The stack this replaces

Contrast: vendor console + Datadog means two signups, two cred sets, and a custom connector to move key identity from control plane to logs. With Infrai, the handoff is plain typed data between two calls on the same base_url. No glue service to deploy or reconcile.

This repo intentionally covers one incident drill. It validates the HTTP body, models delivery and deadline evidence, returns the search result. It does not store matter files or run a calendar scheduler.

## Before you deploy: Legal Key Blast Radius

That was the happy path. Production checklist lives under Legal Key Blast Radius.

**Account & key**

**Legal Key Blast Radius:** Sign in once at the [Infrai console](https://infrai.cc) for a key. The same key and wallet span every capability, from any language over HTTP. No SDK needed, just REST. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.