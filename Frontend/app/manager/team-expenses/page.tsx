"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

const FILTERS = ["all", "pending", "approved", "rejected", "draft"] as const;

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    approved: "mac-badge mac-badge-green",
    rejected: "mac-badge mac-badge-red",
    pending: "mac-badge mac-badge-yellow",
    draft: "mac-badge mac-badge-grey",
  };
  return <span className={classes[status] ?? "mac-badge mac-badge-grey"}>{status.toUpperCase()}</span>;
}

export default function ManagerTeamExpensesPage() {
  const actor = useQuery(api.auth.current);
  const expenses = useQuery(api.expenses.getManagerTeamExpenses, actor ? {} : "skip") || [];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const filtered =
    filter === "all" ? expenses : expenses.filter((expense) => expense.status === filter);

  const total = expenses.length;
  const pending = expenses.filter((expense) => expense.status === "pending").length;
  const approvedAmount = expenses
    .filter((expense) => expense.status === "approved")
    .reduce((sum, expense) => sum + expense.amount, 0);

  if (!actor) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--mac-text-secondary)", fontSize: 13 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--mac-border-strong)", borderTopColor: "var(--mac-accent)", animation: "spin 0.8s linear infinite" }} />
        Loading team expenses…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="mac-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-text-primary)", margin: 0 }}>
          Team Expenses
        </h2>
        <p style={{ fontSize: 13, color: "var(--mac-text-secondary)", marginTop: 4 }}>
          Monitor your team&apos;s submissions and approval progress.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div className="mac-card" style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--mac-text-secondary)", margin: "0 0 6px" }}>
            Team Submissions
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-text-primary)", margin: 0, lineHeight: 1 }}>
            {total}
          </p>
        </div>
        <div className="mac-card" style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--mac-text-secondary)", margin: "0 0 6px" }}>
            Pending Decisions
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-yellow)", margin: 0, lineHeight: 1 }}>
            {pending}
          </p>
        </div>
        <div className="mac-card" style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--mac-text-secondary)", margin: "0 0 6px" }}>
            Approved Spend
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-green)", margin: 0, lineHeight: 1 }}>
            ${approvedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--mac-surface-solid)", border: "1px solid var(--mac-border)", borderRadius: 100, padding: 4, width: "fit-content" }}>
        {FILTERS.map((value) => (
          <button key={value} className={`mac-filter-tab${filter === value ? " active" : ""}`} onClick={() => setFilter(value)}>
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.length === 0 ? (
          <div className="mac-card" style={{ padding: 44, textAlign: "center", color: "var(--mac-text-secondary)", fontSize: 13 }}>
            No expenses match the selected filter.
          </div>
        ) : (
          filtered.map((expense) => (
            <div key={expense._id} className="mac-card" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <StatusBadge status={expense.status} />
                  <span style={{ fontSize: 12, color: "var(--mac-text-tertiary)" }}>{expense.submitter_name}</span>
                  <span className="mac-badge mac-badge-grey">{expense.category}</span>
                </div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--mac-text-primary)", letterSpacing: "-0.02em" }}>
                  {expense.currency} {expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--mac-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 580 }}>
                  {expense.description || "No description"}
                </p>
              </div>

              <div style={{ minWidth: 230, textAlign: "right" }}>
                <p style={{ margin: 0, fontSize: 12, color: "var(--mac-text-tertiary)" }}>
                  {expense.submitted_at
                    ? new Date(expense.submitted_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Not submitted"}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mac-text-secondary)" }}>
                  Approvers: {expense.approvers.length}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
