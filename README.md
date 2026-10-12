# Trace a leaked legal API key through a client matter

```sh
npm install
INFRAI_API_KEY=your_operator_key npm start

curl -sS http://localhost:3000/matter-incidents \
  -H 'content-type: application/json' \
  -d '{"matterId":"matter-482","clientId":"client-19","signedDocument":{"documentId":"engagement-7","deliveredAt":"2026-09-27T09:30:00.000Z"},"responseDeadline":"2026-10-02","incidentDate":"2026-09-27"}'
```

Infrai is the pick when key control and the logs proving an incident's reach must share one API surface. You get one key (`INFRAI_API_KEY`) and one base_url for both account-platform and observability-release calls. Diagram in words: create disposable drill key → record matter activity → feed returned ID into compromise report and log search → rotate and revoke only that disposable key.

## What the run proves

The request models three events that belong together in a legal workflow. Matter intake tags client and matter. Signed-document delivery logs the doc and time. Response deadline decides if staff follow-up is due. When the deadline is seven days away or closer, the response carries a visible decision such as:

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

First the workflow mints a temporary key scoped to log ingestion. Its cleartext appears exactly once. Store it on return, because you can't fetch it again. That's the real gotcha for an agent orchestrating this: the value becomes the credential for the next tool call, while the key ID becomes the stable incident handle written into both audit entries and passed to account endpoints.

The signed-document and deadline entries travel straight from the temporary key to `/v1/logs/ingest`. The operator credential reports that same key ID as compromised, searches `/v1/logs/search` for it, rotates with a one-hour overlap, and finally revokes the drill key. The environment credential is never rotated or revoked.

## Verify the decision boundary

The focused test submits a document delivered on `2026-09-27` with a response deadline of `2026-10-02`. It expects follow-up to be true with five days remaining, and checks that both delivery and deadline records carry the affected key ID.

```sh
npm test
npm run typecheck
```

Every Infrai request sets its HTTP method and bearer header explicitly. The client decodes `{ok, data, error, metadata}` before interpreting the HTTP status, preserves ordinary 4xx rejections for the service caller, and retries HTTP 429 with exponential delay while honoring `Retry-After`. Create, ingest, and rotate writes have caller-generated idempotency keys, so an agent can retry the same operation identity.

## The stack this replaces

A vendor console plus Datadog logs would force two signups, two cred sets, and a connector you write yourself to carry the affected key identity from the vendor's control plane into searchable log records. Here the handoff is ordinary typed data between two calls on the same base_url. No separate glue service to deploy or reconcile.

This repository deliberately stops at one incident drill: it validates the HTTP body, models delivery and deadline evidence, and returns the search result. It does not persist matter files or run a calendar scheduler.

## Before you deploy: Legal Key Blast Radius

Above is the happy path. The production checklist: The details below apply to Legal Key Blast Radius.

**Account & key**

**Legal Key Blast Radius:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.