import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const matterIncidentSchema = z.object({
  matterId: z.string().min(1),
  clientId: z.string().min(1),
  signedDocument: z.object({
    documentId: z.string().min(1),
    deliveredAt: z.string().datetime(),
  }),
  responseDeadline: z.string().date(),
  incidentDate: z.string().date(),
});

export type MatterIncident = z.infer<typeof matterIncidentSchema>;
export type DeadlineDecision = {
  followUp: boolean;
  daysRemaining: number;
  reason: "due_within_seven_days" | "monitor";
};

type CreatedKey = { key_id: string; key_secret: string };
type MatterLog = {
  timestamp: string;
  level: "info" | "warn";
  service: string;
  environment: string;
  trace_id: string;
  message: string;
  metadata: Record<string, string | number | boolean>;
};

function utcDay(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`) / 86_400_000;
}

export function decideDeadlineFollowUp(input: MatterIncident): DeadlineDecision {
  const daysRemaining = Math.ceil(utcDay(input.responseDeadline) - utcDay(input.incidentDate));
  return daysRemaining <= 7
    ? { followUp: true, daysRemaining, reason: "due_within_seven_days" }
    : { followUp: false, daysRemaining, reason: "monitor" };
}

export function matterAuditEntries(
  input: MatterIncident,
  affectedKeyId: string,
  recordedAt = new Date().toISOString(),
): MatterLog[] {
  const deadline = decideDeadlineFollowUp(input);
  const common = {
    timestamp: recordedAt,
    service: "legal-matter-intake",
    environment: "incident-drill",
    trace_id: input.matterId,
  } as const;
  return [
    {
      ...common,
      level: "info",
      message: "signed document delivered",
      metadata: {
        affected_key_id: affectedKeyId,
        matter_id: input.matterId,
        client_id: input.clientId,
        document_id: input.signedDocument.documentId,
        delivered_at: input.signedDocument.deliveredAt,
      },
    },
    {
      ...common,
      level: deadline.followUp ? "warn" : "info",
      message: "response deadline evaluated",
      metadata: {
        affected_key_id: affectedKeyId,
        matter_id: input.matterId,
        response_deadline: input.responseDeadline,
        deadline_follow_up: deadline.followUp,
        days_remaining: deadline.daysRemaining,
      },
    },
  ];
}

export async function runMatterIncident(operator: InfraiClient, input: MatterIncident) {
  const operationId = `${input.matterId}-${Date.now()}`;
  const created = await operator.request<CreatedKey>("POST", "/v1/account/keys/create", {
    body: {
      name: `matter-drill-${input.matterId}`,
      scopes: ["logs.ingest"],
      idempotency_key: `create-${operationId}`,
    },
  });
  if (!created.key_id || !created.key_secret) throw new Error("Key creation response is incomplete");

  const temporaryKey = new InfraiClient(created.key_secret);
  await temporaryKey.request("POST", "/v1/logs/ingest", {
    body: {
      entries: matterAuditEntries(input, created.key_id),
      idempotency_key: `matter-events-${operationId}`,
    },
  });

  await operator.request("POST", `/v1/account/keys/suspected_compromise/${encodeURIComponent(created.key_id)}`, {
    body: { confirmed_leak: true, auto_rotate: false },
  });
  const blastRadius = await operator.request<unknown>("GET", "/v1/logs/search", {
    query: { q: created.key_id },
  });
  await operator.request("POST", `/v1/account/keys/rotate/${encodeURIComponent(created.key_id)}`, {
    body: { grace_hours: 1, idempotency_key: `rotate-${operationId}` },
  });
  await operator.request("DELETE", `/v1/account/keys/revoke/${encodeURIComponent(created.key_id)}`);

  return {
    matterId: input.matterId,
    affectedKeyId: created.key_id,
    deadline: decideDeadlineFollowUp(input),
    blastRadius,
    keyState: "revoked_after_rotation" as const,
  };
}
