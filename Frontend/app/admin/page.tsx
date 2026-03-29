"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Id } from "@/convex/_generated/dataModel";

export default function OrganizationSetup() {
  const currentUser = useQuery(api.auth.current);
  const users = useQuery(
    api.users.getUsers,
    currentUser ? {} : "skip"
  );

  const updateUser  = useMutation(api.users.updateUser);
  const createUser  = useMutation(api.users.adminCreateUser);
  const deleteUser  = useMutation(api.users.deleteUser);

  const [isAdding,    setIsAdding]    = useState(false);
  const [newName,     setNewName]     = useState("");
  const [newEmail,    setNewEmail]    = useState("");
  const [newRole,     setNewRole]     = useState<"admin"|"manager"|"employee">("employee");
  const [newManagerId,setNewManagerId] = useState("");

  if (!currentUser || !users) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", color: "var(--mac-text-secondary)", fontSize: 13 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid var(--mac-border-strong)", borderTopColor: "var(--mac-accent)", animation: "spin 0.8s linear infinite" }} />
        Loading users…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!newName || !newEmail) return;
    try {
      await createUser({
        name: newName,
        email: newEmail,
        role: newRole,
        manager_id: newManagerId ? (newManagerId as Id<"users">) : undefined,
      });
      setIsAdding(false); setNewName(""); setNewEmail(""); setNewRole("employee"); setNewManagerId("");
    } catch { alert("Failed to create user"); }
  };

  return (
    <div className="mac-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--mac-text-primary)", margin: 0 }}>
            Organization Setup
          </h2>
          <p style={{ fontSize: 13, color: "var(--mac-text-secondary)", marginTop: 4 }}>
            Manage users, assign roles, and define reporting hierarchies.
          </p>
        </div>
        <button className="mac-btn-primary" onClick={() => setIsAdding(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
          Add User
        </button>
      </div>

      {/* Add User form inline */}
      {isAdding && (
        <div className="mac-card" style={{ padding: 20 }}>
          <p className="mac-section-title" style={{ marginBottom: 16 }}>New User</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label className="mac-label">Full Name</label>
              <input className="mac-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Marc" />
            </div>
            <div>
              <label className="mac-label">Email</label>
              <input className="mac-input" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="marc@company.com" type="email" />
            </div>
            <div>
              <label className="mac-label">Role</label>
              <select
                className="mac-select"
                value={newRole}
                onChange={e =>
                  setNewRole(e.target.value as "admin" | "manager" | "employee")
                }
              >
                <option value="employee">Employee</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="mac-label">Reports to</label>
              <select className="mac-select" value={newManagerId} onChange={e => setNewManagerId(e.target.value)}>
                <option value="">None</option>
                {users.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="mac-btn" onClick={() => setIsAdding(false)}>Cancel</button>
            <button className="mac-btn-primary" onClick={handleCreate}>Add User</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="mac-card" style={{ overflow: "hidden", padding: 0 }}>
        <table className="mac-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Reports To</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--mac-text-secondary)", padding: "40px 0" }}>
                  No users found. Use &quot;Add User&quot; to get started.
                </td>
              </tr>
            )}
            {users.map((user) => {
              return (
                <tr key={user._id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Avatar */}
                      <div
                        style={{
                          width: 32, height: 32, borderRadius: "50%",
                          background: "var(--mac-accent-alpha)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--mac-accent)" }}>
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: "var(--mac-text-primary)" }}>{user.name}</div>
                        <div style={{ fontSize: 11, color: "var(--mac-text-tertiary)" }}>{user.email}</div>
                        {!user.clerkId && (
                          <span className="mac-badge mac-badge-yellow" style={{ marginTop: 3, fontSize: 10 }}>Pending Signup</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      value={user.role}
                      onChange={e => updateUser({ user_id: user._id, role: e.target.value as "admin" | "manager" | "employee" })}
                      style={{
                        background: "transparent",
                        border: "none",
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--mac-text-primary)",
                        cursor: "pointer",
                        padding: 0,
                        fontFamily: "inherit",
                      }}
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={user.manager_id || ""}
                      onChange={e => {
                        const managerId = e.target.value;
                        if (managerId) {
                          void updateUser({ user_id: user._id, manager_id: managerId as Id<"users"> });
                        } else {
                          void updateUser({ user_id: user._id, clear_manager: true });
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        fontSize: 13,
                        color: "var(--mac-text-primary)",
                        cursor: "pointer",
                        padding: 0,
                        fontFamily: "inherit",
                      }}
                    >
                      <option value="">— None —</option>
                      {users.filter(u => u._id !== user._id).map(u => (
                        <option key={u._id} value={u._id}>{u.name}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      {!user.clerkId && (
                        <button className="mac-btn" style={{ fontSize: 12, padding: "5px 12px" }}>
                          Send Invite
                        </button>
                      )}
                      <button
                        className="mac-btn-danger"
                        style={{ fontSize: 12, padding: "5px 12px" }}
                        onClick={async () => {
                          if (window.confirm("Delete this user? This cannot be undone.")) {
                            await deleteUser({ user_id: user._id });
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
