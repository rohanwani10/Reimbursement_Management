"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";

type Tab = "actionable" | "all" | "done";

function Badge({ status }: { status: "approved" | "rejected" | "pending" | "skipped" }) {
  const classes: Record<string, string> = {
    approved: "mac-badge mac-badge-green",
    rejected: "mac-badge mac-badge-red",
    pending: "mac-badge mac-badge-yellow",
    skipped: "mac-badge mac-badge-grey",
  };

  return <span className={classes[status] ?? "mac-badge mac-badge-grey"}>{status.toUpperCase()}</span>;
}

export default function ManagerApprovalQueuePage() {
  const actor = useQuery(api.auth.current);
  const approvals = useQuery(api.approvals.listMyApprovalQueue, actor ? {} : "skip") || [];
  const approveCurrentStep = useMutation(api.approvals.approveCurrentStep);
  const rejectCurrentStep = useMutation(api.approvals.rejectCurrentStep);

  const [tab, setTab] = useState<Tab>("actionable");
  const [busyExpense, setBusyExpense] = useState<string | null>(null);

  const actionableCount = approvals.filter((a) => a.is_actionable).length;
  const completedByMe = approvals.filter((a) => a.step_status === "approved" || a.step_status === "rejected").length;

  const visibleApprovals = (() => {
    if (tab === "actionable") {
      return approvals.filter((a) => a.is_actionable);
    }
    if (tab === "done") {
      return approvals.filter((a) => a.step_status === "approved" || a.step_status === "rejected");
    }
    return approvals;
  })();

  const handleApprove = async (expenseId: Id<"expenses">) => {
    const comments = window.prompt("Optional approval comment:") || undefined;
    setBusyExpense(expenseId);
    try {
      await approveCurrentStep({ expense_id: expenseId, comments });
    } catch (error) {
      console.error(error);
      alert("Failed to approve. Ensure this is currently your active step.");
    } finally {
      setBusyExpense(null);
    }
  };

  const handleReject = async (expenseId: Id<"expenses">) => {
    const comments = window.prompt("Reason for rejection (required):");
    if (comments === null || !comments.trim()) {
      return;
    }

    setBusyExpense(expenseId);
    try {
      await rejectCurrentStep({ expense_id: expenseId, comments: comments.trim() });
    } catch (error) {
      console.error(error);
      alert("Failed to reject. Ensure this is currently your active step.");
    } finally {
      setBusyExpense(null);
    }
  };

  if (!actor) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--mac-text-secondary)", fontSize: 13 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--mac-border-strong)", borderTopColor: "var(--mac-accent)", animation: "spin 0.8s linear infinite" }} />
        Loading approvals…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="mac-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-text-primary)", margin: 0 }}>
          Approval Queue
        </h2>
        <p style={{ fontSize: 13, color: "var(--mac-text-secondary)", marginTop: 4 }}>
          Review and process requests routed to you by policy.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <div className="mac-card" style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--mac-text-secondary)", margin: "0 0 6px" }}>
            Actionable Now
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-yellow)", margin: 0, lineHeight: 1 }}>
            {actionableCount}
          </p>
        </div>
        <div className="mac-card" style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--mac-text-secondary)", margin: "0 0 6px" }}>
            Total Routed
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-text-primary)", margin: 0, lineHeight: 1 }}>
            {approvals.length}
          </p>
        </div>
        <div className="mac-card" style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--mac-text-secondary)", margin: "0 0 6px" }}>
            Completed By You
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-green)", margin: 0, lineHeight: 1 }}>
            {completedByMe}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--mac-surface-solid)", border: "1px solid var(--mac-border)", borderRadius: 100, padding: 4, width: "fit-content" }}>
        <button className={`mac-filter-tab${tab === "actionable" ? " active" : ""}`} onClick={() => setTab("actionable")}>Actionable</button>
        <button className={`mac-filter-tab${tab === "all" ? " active" : ""}`} onClick={() => setTab("all")}>All</button>
        <button className={`mac-filter-tab${tab === "done" ? " active" : ""}`} onClick={() => setTab("done")}>Done</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visibleApprovals.length === 0 ? (
          <div className="mac-card" style={{ padding: 44, textAlign: "center", color: "var(--mac-text-secondary)", fontSize: 13 }}>
            No approval items in this view.
          </div>
        ) : (
          visibleApprovals.map((item) => (
            <div key={item.step_id} className="mac-card" style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Badge status={item.step_status} />
                  {item.is_actionable && <span className="mac-badge mac-badge-blue">ACTIVE STEP</span>}
                  <span style={{ fontSize: 12, color: "var(--mac-text-tertiary)" }}>Step {item.step_order}</span>
                </div>
                <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--mac-text-primary)", letterSpacing: "-0.02em" }}>
                  {item.currency} {item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--mac-text-secondary)" }}>
                  {item.submitter_name} · {item.category} · {item.description || "No description"}
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {item.is_actionable ? (
                  <>
                    <button
                      className="mac-btn"
                      style={{ color: "var(--mac-green)", borderColor: "rgba(52,199,89,0.25)", background: "var(--mac-green-bg)" }}
                      disabled={busyExpense === item.expense_id}
                      onClick={() => handleApprove(item.expense_id)}
                    >
                      Approve
                    </button>
                    <button
                      className="mac-btn-danger"
                      disabled={busyExpense === item.expense_id}
                      onClick={() => handleReject(item.expense_id)}
                    >
                      Reject
                    </button>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--mac-text-tertiary)", width: 140, textAlign: "right" }}>
                    {item.current_pending_order && item.step_status === "pending"
                      ? `Waiting for step ${item.current_pending_order}`
                      : "Already processed"}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
