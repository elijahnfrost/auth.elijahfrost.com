"use client";

import { Button, TextInput } from "@elijahfrost/design-system";
import { useState, useTransition, type CSSProperties } from "react";
import {
  CodesMap,
  GATED_SUBDOMAINS,
  GrantableScope,
  POLICIES,
  Policy,
  SCOPES,
} from "@/lib/scopes";

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

const sectionStyle: CSSProperties = {
  marginTop: "3rem",
};

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

const selectStyle: CSSProperties = {
  background: "var(--color-bg-elevated)",
  color: "var(--color-fg)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "0.4rem 0.5rem",
  fontSize: "0.875rem",
  fontFamily: "inherit",
};

type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  initialPolicies: Record<string, Policy>;
  initialCodes: CodesMap;
}

export function AdminClient({ initialPolicies, initialCodes }: Props) {
  return (
    <>
      <PoliciesSection initial={initialPolicies} />
      <CodesSection initial={initialCodes} />
    </>
  );
}

function PoliciesSection({ initial }: { initial: Record<string, Policy> }) {
  const [policies, setPolicies] = useState(initial);
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (subdomain: string, policy: Policy) => {
    setPolicies((p) => ({ ...p, [subdomain]: policy }));
    setErrorFor(null);
    startTransition(async () => {
      try {
        const res = await fetch("/admin/api/policy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subdomain, policy }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        setSavedFor(subdomain);
        setTimeout(() => setSavedFor((s) => (s === subdomain ? null : s)), 2000);
      } catch {
        setErrorFor(subdomain);
      }
    });
  };

  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>Project policies</h2>
      <p style={sectionEyebrowStyle}>per-subdomain access rules</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={headStyle}>Subdomain</th>
            <th style={headStyle}>Policy</th>
            <th style={{ ...headStyle, width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {GATED_SUBDOMAINS.map((sub) => (
            <tr key={sub}>
              <td style={cellStyle}>
                <code style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {sub}.elijahfrost.com
                </code>
              </td>
              <td style={cellStyle}>
                <select
                  style={selectStyle}
                  value={policies[sub] ?? "gated"}
                  disabled={pending}
                  onChange={(e) => update(sub, e.target.value as Policy)}
                >
                  {POLICIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </td>
              <td style={{ ...cellStyle, fontSize: 12, color: "var(--color-fg-muted)" }}>
                {errorFor === sub
                  ? <span style={{ color: "var(--color-fg-danger, #ff6a6a)" }}>error</span>
                  : savedFor === sub
                    ? "saved"
                    : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CodesSection({ initial }: { initial: CodesMap }) {
  const [codes, setCodes] = useState(initial);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [labels, setLabels] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial).map(([h, e]) => [h, e.label ?? ""]))
  );
  const [rowState, setRowState] = useState<Record<string, SaveState>>({});
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
        2000
      );
    }
  };

  const updateRow = async (hash: string, patch: { scope?: GrantableScope; label?: string }) => {
    setRow(hash, "saving");
    setCodes((c) => ({
      ...c,
      [hash]: { ...c[hash], ...(patch.scope ? { scope: patch.scope } : {}), ...(patch.label !== undefined ? { label: patch.label } : {}) },
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
      setCodes((c) => ({ ...c, [body.hash]: { scope: newScope, label: newLabel || undefined } }));
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
            <th style={headStyle}>Code (hash)</th>
            <th style={{ ...headStyle, width: 130 }}>Scope</th>
            <th style={headStyle}>Label</th>
            <th style={{ ...headStyle, width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {sortedHashes.map((hash) => {
            const entry = codes[hash];
            const isRevealed = revealed[hash];
            const display = isRevealed ? hash : `${hash.slice(0, 10)}…`;
            return (
              <tr key={hash}>
                <td style={cellStyle}>
                  <button
                    type="button"
                    onClick={() => setRevealed((r) => ({ ...r, [hash]: !r[hash] }))}
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
                    title={isRevealed ? "Hide" : "Reveal"}
                  >
                    {display}
                  </button>
                </td>
                <td style={cellStyle}>
                  <select
                    style={selectStyle}
                    value={entry.scope}
                    onChange={(e) =>
                      startTransition(() =>
                        void updateRow(hash, { scope: e.target.value as GrantableScope })
                      )
                    }
                  >
                    {SCOPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
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
                    style={{
                      background: "transparent",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      padding: "0.35rem 0.65rem",
                      cursor: "pointer",
                      color: "var(--color-fg-muted)",
                      fontSize: "0.8125rem",
                      fontFamily: "inherit",
                    }}
                  >
                    revoke
                  </button>
                  <span style={{ marginLeft: 8, fontSize: 12, color: "var(--color-fg-muted)" }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 1fr auto", gap: "0.5rem", alignItems: "center" }}>
                <TextInput
                  type="password"
                  placeholder="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <select
                  style={selectStyle}
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value as GrantableScope)}
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <TextInput
                  type="text"
                  placeholder="label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <Button type="button" onClick={() => void addRow()} disabled={!newPassword}>
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
