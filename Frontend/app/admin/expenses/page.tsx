"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";

const FILTERS = ["all", "pending", "approved", "rejected", "draft"] as const;

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    approved: "mac-badge mac-badge-green",
    rejected:  "mac-badge mac-badge-red",
    pending:   "mac-badge mac-badge-yellow",
    draft:     "mac-badge mac-badge-grey",
  };
  return (
    <span className={classes[status] ?? "mac-badge mac-badge-grey"}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function ExpensesMonitoring() {
  const currentUser = useQuery(api.auth.current);
  const expenses = useQuery(api.expenses.getAllExpenses, currentUser ? {} : "skip");
  const overrideExpense = useMutation(api.expenses.overrideExpense);

  const [filterStatus, setFilterStatus] = useState("all");

  if (!currentUser || expenses === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--mac-text-secondary)", fontSize: 13 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--mac-border-strong)", borderTopColor: "var(--mac-accent)", animation: "spin 0.8s linear infinite" }} />
        Loading expenses…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const handleOverride = async (expenseId: string, status: "approved" | "rejected") => {
    const reason = window.prompt(`Enter reason for ${status} override:`);
    if (reason === null) return;
    try {
      await overrideExpense({
        expense_id: expenseId as Id<"expenses">,
        status,
        comments: reason,
      });
    } catch { alert("Failed to override expense."); }
  };

  const filteredExpenses = filterStatus === "all"
    ? expenses
    : expenses.filter(e => e.status === filterStatus);

  /* Summary stats */
  const total    = expenses.length;
  const pending  = expenses.filter(e => e.status === "pending").length;
  const approved = expenses.filter(e => e.status === "approved").length;
  const rejected = expenses.filter(e => e.status === "rejected").length;
  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="mac-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-text-primary)", margin: 0 }}>
          Expense Monitoring
        </h2>
        <p style={{ fontSize: 13, color: "var(--mac-text-secondary)", marginTop: 4 }}>
          Track all company expenses, monitor approval chains, and handle exceptions.
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Total Expenses",  value: total,                        sub: `$${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
          { label: "Pending Review",  value: pending,  color: "var(--mac-yellow)" },
          { label: "Approved",        value: approved, color: "var(--mac-green)"  },
          { label: "Rejected",        value: rejected,  color: "var(--mac-red)"   },
        ].map(s => (
          <div key={s.label} className="mac-card" style={{ padding: "16px 18px" }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--mac-text-secondary)", margin: "0 0 6px" }}>
              {s.label}
            </p>
            <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: s.color ?? "var(--mac-text-primary)", margin: 0, lineHeight: 1 }}>
              {s.value}
            </p>
            {s.sub && <p style={{ fontSize: 11, color: "var(--mac-text-tertiary)", marginTop: 4 }}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          background: "var(--mac-surface-solid)",
          border: "1px solid var(--mac-border)",
          borderRadius: 100,
          padding: 4,
          width: "fit-content",
        }}
      >
        {FILTERS.map(f => (
          <button
            key={f}
            className={`mac-filter-tab${filterStatus === f ? " active" : ""}`}
            onClick={() => setFilterStatus(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Expense cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filteredExpenses.length === 0 ? (
          <div className="mac-card" style={{ padding: 48, textAlign: "center", color: "var(--mac-text-secondary)", fontSize: 13 }}>
            No expenses match the selected filter.
          </div>
        ) : (
          filteredExpenses.map((expense) => (
            <div
              key={expense._id}
              className="mac-card"
              style={{ display: "flex", overflow: "hidden", padding: 0 }}
            >
              {/* Left: main info */}
              <div
                style={{
                  padding: "18px 20px",
                  width: 280,
                  flexShrink: 0,
                  borderRight: "1px solid var(--mac-border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusBadge status={expense.status} />
                  <span style={{ fontSize: 11, color: "var(--mac-text-tertiary)" }}>
                    {expense.submitted_at
                      ? new Date(expense.submitted_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Not submitted"}
                  </span>
                </div>

                <p style={{
                  fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em",
                  color: "var(--mac-text-primary)", margin: 0, fontVariantNumeric: "tabular-nums",
                }}>
                  {expense.currency} {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 500, color: "var(--mac-text-primary)" }}>{expense.submitter_name}</span>
                  <span style={{ color: "var(--mac-text-tertiary)" }}>·</span>
                  <span className="mac-badge mac-badge-grey" style={{ fontSize: 11 }}>{expense.category}</span>
                </div>

                {expense.status === "pending" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button
                      className="mac-btn"
                      style={{ flex: 1, justifyContent: "center", fontSize: 12, color: "var(--mac-green)", borderColor: "rgba(52,199,89,0.25)", background: "var(--mac-green-bg)" }}
                      onClick={() => handleOverride(expense._id, "approved")}
                    >
                      ✓ Approve
                    </button>
                    <button
                      className="mac-btn-danger"
                      style={{ flex: 1, justifyContent: "center", fontSize: 12 }}
                      onClick={() => handleOverride(expense._id, "rejected")}
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>

              {/* Right: approval chain */}
              <div style={{ flex: 1, padding: "18px 20px", background: "var(--mac-surface-2)" }}>
                <p className="mac-section-title" style={{ marginBottom: 12 }}>Approval Chain</p>

                {expense.approvers.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--mac-text-tertiary)", fontStyle: "italic" }}>
                    No approvers assigned — may be auto-approved by policy or requires admin action.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {expense.approvers.map((app) => (
                      <div
                        key={app._id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 12px",
                          background: "var(--mac-surface-solid)",
                          border: "1px solid var(--mac-border)",
                          borderRadius: "var(--mac-radius-sm)",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 20, height: 20, borderRadius: "50%",
                              background: "var(--mac-accent-alpha)",
                              color: "var(--mac-accent)",
                              fontSize: 10, fontWeight: 700,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {app.step_order}
                          </span>
                          <span style={{ fontWeight: 500, color: "var(--mac-text-primary)" }}>{app.name}</span>
                        </div>
                        <StatusBadge status={app.status} />
                      </div>
                    ))}
                  </div>
                )}

                {expense.ocr_data && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--mac-border)" }}>
                    <button style={{ fontSize: 12, color: "var(--mac-accent)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                      📄 View OCR Data — Confidence: {(expense.ocr_data.confidence * 100).toFixed(0)}%
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
