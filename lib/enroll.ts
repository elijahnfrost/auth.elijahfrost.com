// Idempotent project enrollment used by both:
//   - POST /admin/api/projects/add (manual add from the UI)
//   - POST /api/webhooks/vercel    (auto-enroll on Vercel domain attach)
//
// Each step (DNS, Vercel attach, KV policy) reports its own status so the
// caller can summarise the work or surface a conflict without rolling back
// completed steps.

import { kvGet, kvPut } from "./kv";
import { isPolicy, Policy } from "./scopes";
import {
  APEX,
  createVercelCname,
  findDnsRecordByName,
} from "./cloudflare-admin";
import { attachDomainToProject, buildDomainToProjectMap, listProjects } from "./vercel";

export type StepStatus = "created" | "updated" | "skipped" | "conflict";

export interface DnsStepResult {
  status: StepStatus;
  note?: string;
  error?: string;
}

export interface VercelStepResult {
  status: StepStatus;
  note?: string;
  error?: string;
  projectName?: string | null;
}

export interface KvStepResult {
  status: StepStatus;
  previous?: Policy;
}

export interface EnrollResult {
  ok: boolean;
  subdomain: string;
  vercelProjectId?: string | null;
  vercelProjectName?: string | null;
  steps: {
    dns: DnsStepResult;
    vercel: VercelStepResult;
    kv: KvStepResult;
  };
  conflict?: { step: "dns" | "vercel"; error: string };
}

const VERCEL_CNAME_RE = /(^|\.)vercel-dns(-\d+)?\.com$/i;

export interface EnrollInput {
  subdomain: string;
  // Pick one of:
  //   manual: { kind: "manual"; vercelProjectId: string }
  //   webhook: { kind: "webhook" } -- Vercel attach already done by Vercel itself
  intent:
    | { kind: "manual"; vercelProjectId: string }
    | { kind: "webhook" };
  policy: Policy;
  // Manual flow overwrites a pre-existing policy if the admin picked a
  // different one. Webhook flow never overwrites (the admin already
  // configured their intent if a policy exists).
  policyOverwrite: boolean;
}

/**
 * Run the three enrollment steps with idempotent semantics.
 *
 * DNS:    skip if record exists & points at Vercel, conflict if it points
 *         elsewhere, create otherwise.
 * Vercel: manual flow attaches if not bound to picked project; webhook flow
 *         marks as skipped (Vercel already attached, that's what fired the
 *         event).
 * KV:     create if absent. If present and equal -> skipped. If present and
 *         different -> updated when policyOverwrite=true, otherwise skipped.
 *
 * On conflict in dns or vercel the function returns early; subsequent steps
 * stay as skipped sentinels.
 */
export async function enrollSubdomain(input: EnrollInput): Promise<EnrollResult> {
  const { subdomain, intent, policy, policyOverwrite } = input;
  const fullName = `${subdomain}.${APEX}`;

  const result: EnrollResult = {
    ok: true,
    subdomain,
    vercelProjectId: intent.kind === "manual" ? intent.vercelProjectId : null,
    vercelProjectName: null,
    steps: {
      dns: { status: "skipped" },
      vercel: { status: "skipped" },
      kv: { status: "skipped" },
    },
  };

  // --- DNS step ---
  const existing = await findDnsRecordByName(subdomain);
  if (existing) {
    if (VERCEL_CNAME_RE.test(existing.content.trim())) {
      result.steps.dns = { status: "skipped", note: "DNS already points at Vercel" };
    } else {
      result.ok = false;
      result.conflict = {
        step: "dns",
        error: `DNS exists pointing at ${existing.content}, refusing to overwrite`,
      };
      result.steps.dns = { status: "conflict", error: result.conflict.error };
      return result;
    }
  } else {
    await createVercelCname(subdomain);
    result.steps.dns = { status: "created" };
  }

  // --- Vercel attach step ---
  if (intent.kind === "manual") {
    const map = await buildDomainToProjectMap();
    const boundTo = map.get(fullName) ?? null;
    const projects = await listProjects();
    const projectName = projects.find((p) => p.id === intent.vercelProjectId)?.name ?? null;
    result.vercelProjectName = projectName;

    if (boundTo === intent.vercelProjectId) {
      result.steps.vercel = {
        status: "skipped",
        note: "Already attached",
        projectName,
      };
    } else if (boundTo) {
      const otherName = projects.find((p) => p.id === boundTo)?.name ?? boundTo;
      result.ok = false;
      result.conflict = {
        step: "vercel",
        error: `Domain is bound to project ${otherName}, detach there first`,
      };
      result.steps.vercel = { status: "conflict", error: result.conflict.error };
      return result;
    } else {
      await attachDomainToProject(intent.vercelProjectId, fullName);
      result.steps.vercel = { status: "created", projectName };
    }
  } else {
    result.steps.vercel = { status: "skipped", note: "Vercel attach handled by event source" };
  }

  // --- KV policy step ---
  const policyKey = `policy:${subdomain}`;
  const currentRaw = await kvGet(policyKey);
  const current = currentRaw && isPolicy(currentRaw) ? (currentRaw as Policy) : null;

  if (current === null) {
    await kvPut(policyKey, policy);
    result.steps.kv = { status: "created" };
  } else if (current === policy) {
    result.steps.kv = { status: "skipped", previous: current };
  } else if (policyOverwrite) {
    await kvPut(policyKey, policy);
    result.steps.kv = { status: "updated", previous: current };
  } else {
    result.steps.kv = { status: "skipped", previous: current };
  }

  return result;
}
