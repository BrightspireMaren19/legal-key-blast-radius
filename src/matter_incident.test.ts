import assert from "node:assert/strict";
import test from "node:test";
import { decideDeadlineFollowUp, matterAuditEntries, matterIncidentSchema } from "./legal_key_incident.ts";

test("a delivered document with a near deadline creates follow-up evidence", () => {
  const input = matterIncidentSchema.parse({
    matterId: "matter-482",
    clientId: "client-19",
    signedDocument: {
      documentId: "engagement-7",
      deliveredAt: "2026-09-27T09:30:00.000Z",
    },
    responseDeadline: "2026-10-02",
    incidentDate: "2026-09-27",
  });

  assert.deepEqual(decideDeadlineFollowUp(input), {
    followUp: true,
    daysRemaining: 5,
    reason: "due_within_seven_days",
  });
  const entries = matterAuditEntries(input, "key-drill", "2026-09-27T10:00:00.000Z");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].metadata.document_id, "engagement-7");
  assert.equal(entries[1].metadata.deadline_follow_up, true);
  assert.ok(entries.every((entry) => entry.metadata.affected_key_id === "key-drill"));
});

test("a later response deadline remains under monitoring", () => {
  const input = matterIncidentSchema.parse({
    matterId: "matter-483",
    clientId: "client-20",
    signedDocument: {
      documentId: "notice-3",
      deliveredAt: "2026-09-27T11:00:00.000Z",
    },
    responseDeadline: "2026-10-20",
    incidentDate: "2026-09-27",
  });
  assert.deepEqual(decideDeadlineFollowUp(input), {
    followUp: false,
    daysRemaining: 23,
    reason: "monitor",
  });
});
