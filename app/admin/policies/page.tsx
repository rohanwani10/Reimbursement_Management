"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";

export default function ApprovalPoliciesSetup() {
  const currentUser = useQuery(api.auth.current);
  const users = useQuery(api.users.getUsers,
    currentUser ? { company_id: currentUser.company_id } : "skip"
  );
  const rules = useQuery(api.rules.getRules,
    currentUser ? { company_id: currentUser.company_id } : "skip"
  );

  const createRule = useMutation(api.rules.createRule);
  const updateRule = useMutation(api.rules.updateRule);
  const deleteRule = useMutation(api.rules.deleteRule);

  const [isAdding, setIsAdding]       = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<Id<"approval_rules"> | null>(null);
  const [name, setName]               = useState("");
  const [category, setCategory]       = useState("");
  const [amountThreshold, setAmountThreshold] = useState("");
  const [priority, setPriority]       = useState("1");
  const [logicType, setLogicType]     = useState<"all"|"percentage"|"specific"|"hybrid">("all");
  const [managerInjection, setManagerInjection] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"sequential"|"parallel">("parallel");
  const [minPercentage, setMinPercentage] = useState("");
  const [specificApproverId, setSpecificApproverId] = useState("");
  const [approversList, setApproversList] = useState<{user_id: string; required: boolean}[]>([]);

  if (!currentUser || !users || !rules) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--mac-text-secondary)", fontSize: 13 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--mac-border-strong)", borderTopColor: "var(--mac-accent)", animation: "spin 0.8s linear infinite" }} />
        Loading policies…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const resetForm = () => {
    setIsAdding(false); setEditingRuleId(null); setName(""); setCategory("");
    setAmountThreshold(""); setPriority("1"); setLogicType("all");
    setManagerInjection(false); setApprovalMode("parallel");
    setMinPercentage(""); setSpecificApproverId(""); setApproversList([]);
  };

  const handleSave = async () => {
    if (!name || approversList.some(a => !a.user_id)) {
      alert("Name and all approver slots must be filled."); return;
    }
    try {
      const payload = {
        company_id:          currentUser.company_id,
        name, priority:      parseInt(priority, 10),
        logic_type:          logicType,
        manager_injection:   managerInjection,
        approval_mode:       approvalMode,
        category:            category || undefined,
        amount_threshold:    amountThreshold ? parseFloat(amountThreshold) : undefined,
        min_percentage:      minPercentage ? parseFloat(minPercentage) : undefined,
        specific_approver_id: specificApproverId ? (specificApproverId as Id<"users">) : undefined,
        approvers:           approversList.map((a, idx) => ({
          user_id: a.user_id as Id<"users">, required: a.required, sequence_order: idx + 1,
        })),
      };
      if (editingRuleId) await updateRule({ rule_id: editingRuleId, ...payload });
      else               await createRule(payload);
      resetForm();
    } catch { alert("Failed to save rule"); }
  };

  const handleEdit = (rule: any) => {
    setEditingRuleId(rule._id); setName(rule.name); setCategory(rule.category || "");
    setAmountThreshold(rule.amount_threshold?.toString() ?? ""); setPriority(rule.priority.toString());
    setLogicType(rule.logic_type); setManagerInjection(rule.manager_injection);
    setApprovalMode(rule.approval_mode); setMinPercentage(rule.min_percentage?.toString() ?? "");
    setSpecificApproverId(rule.specific_approver_id || "");
    setApproversList(rule.approvers.map((a: any) => ({ user_id: a.user_id, required: a.required })));
    setIsAdding(true);
  };

  const logicBadge = (t: string) => {
    switch(t) {
      case "all":        return "mac-badge mac-badge-blue";
      case "percentage": return "mac-badge mac-badge-yellow";
      case "specific":   return "mac-badge mac-badge-green";
      default:           return "mac-badge mac-badge-grey";
    }
  };

  return (
    <div className="mac-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-text-primary)", margin: 0 }}>
            Approval Policies
          </h2>
          <p style={{ fontSize: 13, color: "var(--mac-text-secondary)", marginTop: 4 }}>
            Define routing logic, approver sequences, and override conditions.
          </p>
        </div>
        {!isAdding && (
          <button className="mac-btn-primary" onClick={() => setIsAdding(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
            </svg>
            Create Rule
          </button>
        )}
      </div>

      {/* ── Rule Form ── */}
      {isAdding && (
        <div className="mac-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--mac-text-primary)", margin: 0 }}>
            {editingRuleId ? "Edit Approval Rule" : "New Approval Rule"}
          </h3>

          {/* Basic info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label className="mac-label">Rule Name *</label>
              <input className="mac-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Travel > $500" />
            </div>
            <div>
              <label className="mac-label">Category</label>
              <input className="mac-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Travel" />
            </div>
            <div>
              <label className="mac-label">Amount Threshold</label>
              <input className="mac-input" type="number" value={amountThreshold} onChange={e => setAmountThreshold(e.target.value)} placeholder="e.g. 500" />
            </div>
            <div>
              <label className="mac-label">Priority</label>
              <input className="mac-input" type="number" value={priority} onChange={e => setPriority(e.target.value)} />
            </div>
          </div>

          {/* Routing & Logic */}
          <div
            style={{
              background: "var(--mac-surface-2)",
              border: "1px solid var(--mac-border)",
              borderRadius: "var(--mac-radius-sm)",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <p className="mac-section-title" style={{ margin: 0 }}>Routing &amp; Logic</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {/* Manager injection */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={managerInjection}
                  onChange={e => setManagerInjection(e.target.checked)}
                  style={{ accentColor: "var(--mac-accent)", width: 15, height: 15 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--mac-text-primary)" }}>Manager Injection</div>
                  <div style={{ fontSize: 11, color: "var(--mac-text-tertiary)" }}>Submitter's manager added automatically</div>
                </div>
              </label>

              {/* Sequential */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={approvalMode === "sequential"}
                  onChange={e => setApprovalMode(e.target.checked ? "sequential" : "parallel")}
                  style={{ accentColor: "var(--mac-accent)", width: 15, height: 15 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--mac-text-primary)" }}>Sequential</div>
                  <div style={{ fontSize: 11, color: "var(--mac-text-tertiary)" }}>Approvers go in order</div>
                </div>
              </label>

              {/* Condition logic */}
              <div>
                <label className="mac-label">Condition Logic</label>
                <select className="mac-select" value={logicType} onChange={e => setLogicType(e.target.value as any)}>
                  <option value="all">ALL — everyone must approve</option>
                  <option value="percentage">PERCENTAGE — min % required</option>
                  <option value="specific">SPECIFIC — one key approver</option>
                  <option value="hybrid">HYBRID — % OR specific</option>
                </select>
              </div>
            </div>

            {(logicType === "percentage" || logicType === "hybrid") && (
              <div style={{ maxWidth: 200 }}>
                <label className="mac-label">Minimum Approval %</label>
                <input className="mac-input" type="number" value={minPercentage} onChange={e => setMinPercentage(e.target.value)} placeholder="e.g. 60" />
              </div>
            )}
            {(logicType === "specific" || logicType === "hybrid") && (
              <div style={{ maxWidth: 260 }}>
                <label className="mac-label">Power Approver</label>
                <select className="mac-select" value={specificApproverId} onChange={e => setSpecificApproverId(e.target.value)}>
                  <option value="">Select user…</option>
                  {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Approvers chain */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p className="mac-section-title" style={{ margin: 0 }}>Approver Chain</p>
              <button
                className="mac-btn"
                style={{ fontSize: 12, padding: "4px 12px" }}
                onClick={() => setApproversList([...approversList, { user_id: "", required: false }])}
              >
                + Add Approver
              </button>
            </div>

            {approversList.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--mac-text-tertiary)", fontStyle: "italic" }}>
                No approvers added. Manager injection may still apply.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {approversList.map((approver, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px",
                      background: "var(--mac-surface-solid)",
                      border: "1px solid var(--mac-border)",
                      borderRadius: "var(--mac-radius-sm)",
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--mac-text-tertiary)", width: 16 }}>{idx + 1}</span>
                    <select
                      className="mac-select"
                      style={{ flex: 1 }}
                      value={approver.user_id}
                      onChange={e => {
                        const u = [...approversList]; u[idx] = { ...u[idx], user_id: e.target.value }; setApproversList(u);
                      }}
                    >
                      <option value="">Select user…</option>
                      {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", whiteSpace: "nowrap" }}>
                      <input
                        type="checkbox"
                        checked={approver.required}
                        onChange={e => {
                          const u = [...approversList]; u[idx] = { ...u[idx], required: e.target.checked }; setApproversList(u);
                        }}
                        style={{ accentColor: "var(--mac-accent)" }}
                      />
                      <span style={{ fontSize: 12, color: "var(--mac-text-secondary)" }}>Required</span>
                    </label>
                    <button
                      onClick={() => setApproversList(approversList.filter((_, i) => i !== idx))}
                      style={{
                        width: 24, height: 24, borderRadius: "50%",
                        border: "none", background: "var(--mac-red-bg)",
                        color: "var(--mac-red)", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 4, borderTop: "1px solid var(--mac-border)" }}>
            <button className="mac-btn" onClick={resetForm}>Cancel</button>
            <button className="mac-btn-primary" onClick={handleSave}>Save Rule</button>
          </div>
        </div>
      )}

      {/* ── Rules list ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="mac-section-title">Existing Rules ({rules.length})</p>

        {rules.length === 0 ? (
          <div className="mac-card" style={{ padding: 40, textAlign: "center", color: "var(--mac-text-secondary)", fontSize: 13 }}>
            No approval rules configured yet. Create your first rule above.
          </div>
        ) : (
          rules.map(rule => (
            <div
              key={rule._id}
              className="mac-card"
              style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--mac-text-primary)" }}>{rule.name}</span>
                  <span className={logicBadge(rule.logic_type)}>{rule.logic_type.toUpperCase()}</span>
                  <span className="mac-badge mac-badge-grey">Pri: {rule.priority}</span>
                </div>
                <p style={{ fontSize: 12, color: "var(--mac-text-secondary)", margin: 0 }}>
                  Category: <strong>{rule.category || "Any"}</strong>
                  {" "}· Threshold: <strong>{rule.amount_threshold ? `≥ $${rule.amount_threshold}` : "Any"}</strong>
                  {" "}· Mode: <strong style={{ textTransform: "capitalize" }}>{rule.approval_mode}</strong>
                  {" "}· Manager Injection: <strong>{rule.manager_injection ? "Yes" : "No"}</strong>
                  {" "}· Approvers: <strong>{rule.approvers.length}</strong>
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="mac-btn" style={{ fontSize: 12, padding: "5px 14px" }} onClick={() => handleEdit(rule)}>
                  Edit
                </button>
                <button className="mac-btn-danger" style={{ fontSize: 12, padding: "5px 14px" }}
                  onClick={async () => { if (window.confirm("Delete this rule?")) await deleteRule({ rule_id: rule._id }); }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
