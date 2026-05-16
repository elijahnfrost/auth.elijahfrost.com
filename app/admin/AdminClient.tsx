"use client";

import { Button, TextInput } from "@elijahfrost/design-system";
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import {
  CodesMap,
  GrantableScope,
  POLICIES,
  POLICY_DESCRIPTIONS,
  Policy,
  PUBLIC_SUBDOMAINS,
  SCOPES,
  SCOPE_DESCRIPTIONS,
} from "@/lib/scopes";
import { StyledSelect } from "@/components/StyledSelect";

export interface ProjectRow {
  subdomain: string;
  fullName: string;
  dnsRecordId: string;
  dnsTarget: string;
  vercelProjectId: string | null;
  vercelProjectName: string | null;
  policy: string;
}

interface VercelProject {
  id: string;
  name: string;
}

interface Props {
  initialProjects: ProjectRow[] | null;
  projectsError: string | null;
  initialVercelProjects: VercelProject[] | null;
  initialCodes: CodesMap;
}

type Tab = "projects" | "policies" | "codes";
type SaveState = "idle" | "saving" | "saved" | "error";

const cellStyle: CSSProperties = {
  padding: "0.75rem 0.75rem",
  borderBottom: "1px solid var(--color-border)",
  fontSize: "0.875rem",
  verticalAlign: "middle",
  color: "var(--color-fg)",
};

const headStyle: CSSProperties = {
  ...cellStyle,
  fontSize: 11,
  letterSpacing: "var(--tracking-display-eyebrow)",
  textTransform: "uppercase",
  color: "var(--color-fg-muted)",
  fontWeight: 500,
  textAlign: "left",
};

const sectionStyle: CSSProperties = { marginTop: "2rem" };

const sectionTitleStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontWeight: 300,
  fontSize: "1.5rem",
  color: "var(--color-fg)",
  margin: 0,
  marginBottom: "0.25rem",
  letterSpacing: "var(--tracking-tight)",
};

const sectionEyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: "var(--tracking-display-eyebrow)",
  textTransform: "uppercase",
  color: "var(--color-fg-muted)",
  margin: 0,
  marginBottom: "1rem",
};

const descriptionStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--color-fg-muted)",
  marginTop: "0.35rem",
  lineHeight: 1.4,
};

const inlineButtonStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "0.35rem 0.65rem",
  cursor: "pointer",
  color: "var(--color-fg-muted)",
  fontSize: "0.8125rem",
  fontFamily: "inherit",
};

const errorTextStyle: CSSProperties = {
  color: "var(--color-fg-danger, #ff6a6a)",
  fontSize: 12,
};

export function AdminClient({
  initialProjects,
  projectsError,
  initialVercelProjects,
  initialCodes,
}: Props) {
  const [tab, setTab] = useState<Tab>("projects");

  return (
    <>
      <TabStrip tab={tab} setTab={setTab} />
      {tab === "projects" ? (
        <ProjectsSection
          initialProjects={initialProjects}
          projectsError={projectsError}
          initialVercelProjects={initialVercelProjects}
        />
      ) : null}
      {tab === "policies" ? (
        <PoliciesSection
          initialProjects={initialProjects}
          projectsError={projectsError}
        />
      ) : null}
      {tab === "codes" ? <CodesSection initial={initialCodes} /> : null}
    </>
  );
}

function TabStrip({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "projects", label: "Projects" },
    { id: "policies", label: "Policies" },
    { id: "codes", label: "Codes" },
  ];
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: "1.25rem",
        marginTop: "2.5rem",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => setTab(t.id)}
            style={{
              background: "transparent",
              border: "none",
              padding: "0.5rem 0.25rem",
              marginBottom: -1,
              borderBottom: active
                ? "2px solid var(--color-fg)"
                : "2px solid transparent",
              color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: "var(--tracking-display-eyebrow)",
              textTransform: "uppercase",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Projects tab                                                           */
/* ---------------------------------------------------------------------- */

function ProjectsSection({
  initialProjects,
  projectsError,
  initialVercelProjects,
}: {
  initialProjects: ProjectRow[] | null;
  projectsError: string | null;
  initialVercelProjects: VercelProject[] | null;
}) {
  const [rows, setRows] = useState<ProjectRow[] | null>(initialProjects);
  const [loadError, setLoadError] = useState<string | null>(projectsError);
  const [refreshing, setRefreshing] = useState(false);
  const [rowState, setRowState] = useState<Record<string, SaveState>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const setRow = (sub: string, state: SaveState) => {
    setRowState((s) => ({ ...s, [sub]: state }));
    if (state === "saved") {
      setTimeout(
        () => setRowState((s) => ({ ...s, [sub]: s[sub] === "saved" ? "idle" : s[sub] })),
        2000,
      );
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/admin/api/projects/list", { cache: "no-store" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as { rows: ProjectRow[] };
      setRows(body.rows);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const updatePolicy = async (sub: string, policy: Policy) => {
    setRow(sub, "saving");
    setRowError((m) => {
      const next = { ...m };
      delete next[sub];
      return next;
    });
    setRows((r) =>
      r ? r.map((row) => (row.subdomain === sub ? { ...row, policy } : row)) : r,
    );
    try {
      const res = await fetch("/admin/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: sub, policy }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `status ${res.status}`);
      }
      setRow(sub, "saved");
    } catch (e) {
      setRow(sub, "error");
      setRowError((m) => ({ ...m, [sub]: (e as Error).message }));
    }
  };

  const removeRow = async (sub: string) => {
    const message = `This removes ${sub}.elijahfrost.com entirely: DNS, Vercel domain binding, and policy. Continue?`;
    if (!confirm(message)) return;
    setRow(sub, "saving");
    try {
      const res = await fetch("/admin/api/projects/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: sub }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(body.detail ?? body.error ?? `status ${res.status}`);
      }
      await refresh();
    } catch (e) {
      setRow(sub, "error");
      setRowError((m) => ({ ...m, [sub]: (e as Error).message }));
    }
  };

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>Projects</h2>
      <p style={sectionEyebrowStyle}>subdomains attached to Vercel projects</p>

      {loadError ? (
        <p style={{ ...errorTextStyle, marginBottom: "1rem" }}>
          Failed to load projects: {loadError}. Check CLOUDFLARE_ADMIN_API_TOKEN and VERCEL_API_TOKEN.
        </p>
      ) : null}

      {rows && rows.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headStyle}>Subdomain</th>
              <th style={headStyle}>DNS target</th>
              <th style={headStyle}>Vercel project</th>
              <th style={{ ...headStyle, minWidth: 160 }}>Policy</th>
              <th style={{ ...headStyle, width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const reserved = (PUBLIC_SUBDOMAINS as readonly string[]).includes(row.subdomain);
              return (
                <tr key={row.subdomain}>
                  <td style={cellStyle}>
                    <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {row.fullName}
                    </code>
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12, color: "var(--color-fg-muted)" }}>
                    {row.dnsTarget}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12, color: "var(--color-fg-muted)" }}>
                    {row.vercelProjectName ?? <span style={{ fontStyle: "italic" }}>unknown</span>}
                  </td>
                  <td style={cellStyle}>
                    <StyledSelect<Policy>
                      options={POLICIES}
                      value={row.policy as Policy}
                      disabled={reserved || rowState[row.subdomain] === "saving"}
                      onValueChange={(v) => void updatePolicy(row.subdomain, v)}
                    />
                    <p style={descriptionStyle}>
                      {reserved
                        ? "Reserved: this subdomain is always public."
                        : POLICY_DESCRIPTIONS[row.policy as Policy]}
                    </p>
                    {rowError[row.subdomain] ? (
                      <p style={errorTextStyle}>error: {rowError[row.subdomain]}</p>
                    ) : null}
                  </td>
                  <td style={cellStyle}>
                    {reserved ? null : (
                      <button
                        type="button"
                        onClick={() => void removeRow(row.subdomain)}
                        style={inlineButtonStyle}
                      >
                        remove
                      </button>
                    )}
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--color-fg-muted)" }}>
                      {rowState[row.subdomain] === "saved" ? "saved" : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : !loadError ? (
        <p style={{ color: "var(--color-fg-muted)", fontSize: "0.875rem" }}>
          {refreshing ? "Loading…" : "No Vercel-attached subdomains found."}
        </p>
      ) : null}

      <AddProjectForm
        vercelProjects={initialVercelProjects}
        onAdded={refresh}
      />
    </section>
  );
}

function AddProjectForm({
  vercelProjects,
  onAdded,
}: {
  vercelProjects: VercelProject[] | null;
  onAdded: () => Promise<void>;
}) {
  const [subdomain, setSubdomain] = useState("");
  const [projectId, setProjectId] = useState<string>(vercelProjects?.[0]?.id ?? "");
  const [policy, setPolicy] = useState<Policy>("gated");
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const normalize = (raw: string) => {
    const stripped = raw.trim().toLowerCase().replace(/\.elijahfrost\.com$/, "");
    return stripped;
  };

  const submit = async () => {
    const sub = normalize(subdomain);
    setError(null);
    if (!sub) {
      setError("Subdomain required");
      return;
    }
    if (!projectId) {
      setError("Pick a Vercel project");
      return;
    }
    setState("saving");
    try {
      const res = await fetch("/admin/api/projects/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subdomain: sub, vercelProjectId: projectId, policy }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          dnsCreated?: boolean;
          vercelAttached?: boolean;
          policySet?: boolean;
        };
        let msg = body.detail ?? body.error ?? `status ${res.status}`;
        if (body.dnsCreated || body.vercelAttached || body.policySet) {
          msg += ` (partial: dns=${body.dnsCreated ? "✓" : "✗"} vercel=${
            body.vercelAttached ? "✓" : "✗"
          } policy=${body.policySet ? "✓" : "✗"})`;
        }
        throw new Error(msg);
      }
      setSubdomain("");
      setPolicy("gated");
      setState("saved");
      await onAdded();
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch (e) {
      setState("error");
      setError((e as Error).message);
    }
  };

  return (
    <div
      style={{
        marginTop: "1.5rem",
        padding: "1.25rem",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
      }}
    >
      <p style={{ ...sectionEyebrowStyle, marginBottom: "0.75rem" }}>Add project</p>
      {vercelProjects == null ? (
        <p style={errorTextStyle}>
          Vercel project list unavailable — check VERCEL_API_TOKEN and VERCEL_TEAM_ID.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(160px, 1.2fr) minmax(160px, 1fr) minmax(140px, 1fr) auto",
            gap: "0.75rem",
            alignItems: "start",
          }}
        >
          <div>
            <TextInput
              placeholder="subdomain"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
            />
            <p style={descriptionStyle}>
              becomes <code>{normalize(subdomain) || "<sub>"}.elijahfrost.com</code>
            </p>
          </div>
          <div>
            <StyledSelect<string>
              options={vercelProjects.map((p) => ({ value: p.id, label: p.name }))}
              value={projectId}
              onValueChange={setProjectId}
            />
            <p style={descriptionStyle}>Vercel project to bind the domain to.</p>
          </div>
          <div>
            <StyledSelect<Policy>
              options={POLICIES}
              value={policy}
              onValueChange={setPolicy}
            />
            <p style={descriptionStyle}>{POLICY_DESCRIPTIONS[policy]}</p>
          </div>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={state === "saving" || !subdomain}
          >
            add
          </Button>
        </div>
      )}
      {error ? <p style={{ ...errorTextStyle, marginTop: "0.75rem" }}>{error}</p> : null}
      {state === "saved" ? (
        <p style={{ fontSize: 12, color: "var(--color-fg-muted)", marginTop: "0.5rem" }}>
          Added. DNS propagation + Vercel TLS provisioning may take a minute.
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Policies tab                                                           */
/* ---------------------------------------------------------------------- */

function PoliciesSection({
  initialProjects,
  projectsError,
}: {
  initialProjects: ProjectRow[] | null;
  projectsError: string | null;
}) {
  const editable = useMemo(
    () =>
      (initialProjects ?? []).filter(
        (r) => !(PUBLIC_SUBDOMAINS as readonly string[]).includes(r.subdomain),
      ),
    [initialProjects],
  );
  const [rows, setRows] = useState<ProjectRow[]>(editable);
  const [rowState, setRowState] = useState<Record<string, SaveState>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const setRow = (sub: string, state: SaveState) => {
    setRowState((s) => ({ ...s, [sub]: state }));
    if (state === "saved") {
      setTimeout(
        () => setRowState((s) => ({ ...s, [sub]: s[sub] === "saved" ? "idle" : s[sub] })),
        2000,
      );
    }
  };

  const update = (sub: string, policy: Policy) => {
    setRows((r) => r.map((row) => (row.subdomain === sub ? { ...row, policy } : row)));
    setRow(sub, "saving");
    setRowError((m) => {
      const next = { ...m };
      delete next[sub];
      return next;
    });
    startTransition(async () => {
      try {
        const res = await fetch("/admin/api/policy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subdomain: sub, policy }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `status ${res.status}`);
        }
        setRow(sub, "saved");
      } catch (e) {
        setRow(sub, "error");
        setRowError((m) => ({ ...m, [sub]: (e as Error).message }));
      }
    });
  };

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>Project policies</h2>
      <p style={sectionEyebrowStyle}>per-subdomain access rules</p>
      {projectsError ? (
        <p style={{ ...errorTextStyle, marginBottom: "1rem" }}>
          Project list unavailable — using last server snapshot.
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p style={{ color: "var(--color-fg-muted)", fontSize: "0.875rem" }}>
          No editable subdomains. Add one in the Projects tab.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headStyle}>Subdomain</th>
              <th style={{ ...headStyle, minWidth: 200 }}>Policy</th>
              <th style={{ ...headStyle, width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.subdomain}>
                <td style={cellStyle}>
                  <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                    {row.fullName}
                  </code>
                </td>
                <td style={cellStyle}>
                  <StyledSelect<Policy>
                    options={POLICIES}
                    value={row.policy as Policy}
                    onValueChange={(v) => update(row.subdomain, v)}
                  />
                  <p style={descriptionStyle}>
                    {POLICY_DESCRIPTIONS[row.policy as Policy]}
                  </p>
                  {rowError[row.subdomain] ? (
                    <p style={errorTextStyle}>error: {rowError[row.subdomain]}</p>
                  ) : null}
                </td>
                <td style={{ ...cellStyle, fontSize: 12, color: "var(--color-fg-muted)" }}>
                  {rowState[row.subdomain] === "saved" ? "saved" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------- */
/* Codes tab                                                              */
/* ---------------------------------------------------------------------- */

function CodesSection({ initial }: { initial: CodesMap }) {
  const [codes, setCodes] = useState(initial);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [labels, setLabels] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial).map(([h, e]) => [h, e.label ?? ""])),
  );
  const [rowState, setRowState] = useState<Record<string, SaveState>>({});
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Add-row state
  const [newPassword, setNewPassword] = useState("");
  const [newScope, setNewScope] = useState<GrantableScope>("read");
  const [newLabel, setNewLabel] = useState("");
  const [addState, setAddState] = useState<SaveState>("idle");

  const setRow = (hash: string, state: SaveState) => {
    setRowState((s) => ({ ...s, [hash]: state }));
    if (state === "saved") {
      setTimeout(
        () => setRowState((s) => ({ ...s, [hash]: s[hash] === "saved" ? "idle" : s[hash] })),
        2000,
      );
    }
  };

  const updateRow = async (hash: string, patch: { scope?: GrantableScope; label?: string }) => {
    setRow(hash, "saving");
    setCodes((c) => ({
      ...c,
      [hash]: {
        ...c[hash],
        ...(patch.scope ? { scope: patch.scope } : {}),
        ...(patch.label !== undefined ? { label: patch.label } : {}),
      },
    }));
    try {
      const res = await fetch("/admin/api/codes/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, ...patch }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setRow(hash, "saved");
    } catch {
      setRow(hash, "error");
    }
  };

  const revokeRow = async (hash: string) => {
    if (!confirm("Revoke this code?")) return;
    setRow(hash, "saving");
    try {
      const res = await fetch("/admin/api/codes/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setCodes((c) => {
        const next = { ...c };
        delete next[hash];
        return next;
      });
    } catch {
      setRow(hash, "error");
    }
  };

  const copyPassword = async (hash: string, password: string) => {
    try {
      await navigator.clipboard.writeText(password);
      setCopiedFor(hash);
      setTimeout(() => setCopiedFor((s) => (s === hash ? null : s)), 1500);
    } catch {
      // navigator.clipboard requires HTTPS or focused document; on a focus
      // failure surface nothing rather than throw — user can read the
      // revealed plaintext directly.
    }
  };

  const addRow = async () => {
    if (!newPassword) return;
    setAddState("saving");
    try {
      const res = await fetch("/admin/api/codes/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword, scope: newScope, label: newLabel }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = (await res.json()) as { hash: string };
      setCodes((c) => ({
        ...c,
        [body.hash]: {
          scope: newScope,
          label: newLabel || undefined,
          password: newPassword,
        },
      }));
      setLabels((l) => ({ ...l, [body.hash]: newLabel }));
      setNewPassword("");
      setNewLabel("");
      setNewScope("read");
      setAddState("saved");
      setTimeout(() => setAddState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setAddState("error");
    }
  };

  const sortedHashes = Object.keys(codes).sort();

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>Codes</h2>
      <p style={sectionEyebrowStyle}>passwords that map to a scope</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headStyle}>Code</th>
            <th style={{ ...headStyle, minWidth: 180 }}>Scope</th>
            <th style={headStyle}>Label</th>
            <th style={{ ...headStyle, width: 140 }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedHashes.map((hash) => {
            const entry = codes[hash];
            const hasPlaintext = typeof entry.password === "string" && entry.password.length > 0;
            const isRevealed = revealed[hash];
            return (
              <tr key={hash}>
                <td style={cellStyle}>
                  <CodeCell
                    hash={hash}
                    password={entry.password}
                    hasPlaintext={hasPlaintext}
                    revealed={!!isRevealed}
                    onToggle={() => setRevealed((r) => ({ ...r, [hash]: !r[hash] }))}
                    onCopy={() => entry.password && copyPassword(hash, entry.password)}
                    copied={copiedFor === hash}
                  />
                </td>
                <td style={cellStyle}>
                  <StyledSelect<GrantableScope>
                    options={SCOPES}
                    value={entry.scope}
                    onValueChange={(v) =>
                      startTransition(() => void updateRow(hash, { scope: v }))
                    }
                  />
                  <p style={descriptionStyle}>{SCOPE_DESCRIPTIONS[entry.scope]}</p>
                </td>
                <td style={cellStyle}>
                  <input
                    type="text"
                    value={labels[hash] ?? ""}
                    onChange={(e) => setLabels((l) => ({ ...l, [hash]: e.target.value }))}
                    onBlur={(e) => {
                      if (e.target.value !== (entry.label ?? "")) {
                        void updateRow(hash, { label: e.target.value });
                      }
                    }}
                    style={{
                      width: "100%",
                      background: "var(--color-bg-elevated)",
                      color: "var(--color-fg)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      padding: "0.4rem 0.5rem",
                      fontSize: "0.875rem",
                      fontFamily: "inherit",
                    }}
                  />
                </td>
                <td style={cellStyle}>
                  <button
                    type="button"
                    onClick={() => void revokeRow(hash)}
                    style={inlineButtonStyle}
                  >
                    revoke
                  </button>
                  <span
                    style={{ marginLeft: 8, fontSize: 12, color: "var(--color-fg-muted)" }}
                  >
                    {rowState[hash] === "saved"
                      ? "saved"
                      : rowState[hash] === "error"
                        ? "error"
                        : ""}
                  </span>
                </td>
              </tr>
            );
          })}

          <tr>
            <td style={cellStyle} colSpan={4}>
              <p style={{ ...sectionEyebrowStyle, marginBottom: "0.5rem" }}>add new code</p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px 1fr auto",
                  gap: "0.75rem",
                  alignItems: "start",
                }}
              >
                <TextInput
                  type="password"
                  placeholder="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <div>
                  <StyledSelect<GrantableScope>
                    options={SCOPES}
                    value={newScope}
                    onValueChange={setNewScope}
                  />
                  <p style={descriptionStyle}>{SCOPE_DESCRIPTIONS[newScope]}</p>
                </div>
                <TextInput
                  type="text"
                  placeholder="label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <Button
                  type="button"
                  onClick={() => void addRow()}
                  disabled={!newPassword || addState === "saving"}
                >
                  add
                </Button>
              </div>
              <p style={{ marginTop: "0.5rem", fontSize: 12, color: "var(--color-fg-muted)" }}>
                {addState === "saved" ? "saved" : addState === "error" ? "error" : ""}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function CodeCell({
  hash,
  password,
  hasPlaintext,
  revealed,
  onToggle,
  onCopy,
  copied,
}: {
  hash: string;
  password: string | undefined;
  hasPlaintext: boolean;
  revealed: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  if (!hasPlaintext) {
    return (
      <span
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "0.8125rem",
          color: "var(--color-fg-muted)",
          fontStyle: "italic",
        }}
        title={`hash: ${hash}`}
      >
        (plaintext unavailable)
      </span>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <button
        type="button"
        onClick={onToggle}
        title={revealed ? "Hide" : "Reveal"}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: "var(--color-fg)",
          fontSize: "0.8125rem",
          textAlign: "left",
        }}
      >
        {revealed ? password : "•".repeat(Math.min(12, password?.length ?? 8))}
      </button>
      <button
        type="button"
        onClick={onCopy}
        title="Copy to clipboard"
        style={{
          ...inlineButtonStyle,
          padding: "0.2rem 0.45rem",
          fontSize: "0.75rem",
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
