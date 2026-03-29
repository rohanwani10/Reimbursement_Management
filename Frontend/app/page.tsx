"use client";

import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { SignUpButton, SignInButton, UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const user = useQuery(api.auth.current);
  return (
    <div
      className="mac-fade-in"
      style={{ minHeight: "100vh", background: "var(--mac-bg)", display: "flex", flexDirection: "column" }}
    >
      {/* ── Toolbar ───────────────────────────────────────── */}
      <header
        className="mac-glass"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          borderBottom: "1px solid var(--mac-border)",
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Traffic-light deco */}
          <div style={{ display: "flex", gap: 6, marginRight: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57", display: "block" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e", display: "block" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840", display: "block" }} />
          </div>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: "var(--mac-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M5 10h10M10 5v10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: 14, color: "var(--mac-text-primary)", letterSpacing: "-0.01em" }}>
            Reimbursement
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeToggle />
          <Authenticated>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {user?.role === "manager" && (
                <Link href="/manager" className="mac-btn" style={{ fontSize: 13 }}>
                  Manager Workspace
                </Link>
              )}
              {user?.role === "admin" && (
                <Link href="/admin" className="mac-btn" style={{ fontSize: 13 }}>
                  Admin Panel
                </Link>
              )}
              <Link href="/employee/expenses" className="mac-btn" style={{ fontSize: 13 }}>
                My Expenses
              </Link>
              <UserButton afterSignOutUrl="/" />
            </div>
          </Authenticated>
          <Unauthenticated>
            <SignInButton mode="modal">
              <button className="mac-btn">Sign In</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="mac-btn-primary">Get Started</button>
            </SignUpButton>
          </Unauthenticated>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px 60px" }}>
        <div style={{ maxWidth: 680, width: "100%", textAlign: "center" }}>
          {/* App badge */}
          <div
            className="mac-badge mac-badge-blue"
            style={{ display: "inline-flex", marginBottom: 24, fontSize: 12 }}
          >
            ✦ Expense Management Platform
          </div>

          <h1
            style={{
              fontSize: "clamp(36px, 6vw, 58px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.10,
              color: "var(--mac-text-primary)",
              marginBottom: 20,
            }}
          >
            Streamline every{" "}
            <span style={{ color: "var(--mac-accent)" }}>reimbursement</span>
            {" "}request
          </h1>

          <p
            style={{
              fontSize: 17,
              color: "var(--mac-text-secondary)",
              lineHeight: 1.6,
              marginBottom: 40,
              maxWidth: 500,
              margin: "0 auto 40px",
            }}
          >
            Automated approval workflows, real-time tracking, and powerful admin controls — built for modern teams.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Authenticated>
              {user?.role === "admin" ? (
                <Link href="/admin">
                  <button className="mac-btn-primary" style={{ padding: "10px 24px", fontSize: 15 }}>
                    Open Admin Panel →
                  </button>
                </Link>
              ) : user?.role === "manager" ? (
                <Link href="/manager">
                  <button className="mac-btn-primary" style={{ padding: "10px 24px", fontSize: 15 }}>
                    Open Manager Workspace →
                  </button>
                </Link>
              ) : (
                <Link href="/employee/expenses">
                  <button className="mac-btn-primary" style={{ padding: "10px 24px", fontSize: 15 }}>
                    Open My Dashboard →
                  </button>
                </Link>
              )}
            </Authenticated>
            <Unauthenticated>
              <SignUpButton mode="modal">
                <button className="mac-btn-primary" style={{ padding: "10px 24px", fontSize: 15 }}>
                  Get Started Free
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button className="mac-btn" style={{ padding: "10px 24px", fontSize: 15 }}>
                  Sign In
                </button>
              </SignInButton>
            </Unauthenticated>
          </div>
        </div>

        {/* ── Feature cards ───────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 16,
            maxWidth: 800,
            width: "100%",
            marginTop: 72,
          }}
        >
          {[
            { icon: "🏢", title: "Organization Setup", desc: "Manage users, assign roles, and define reporting hierarchies." },
            { icon: "✅", title: "Approval Policies", desc: "Create rule-based workflows with sequential or parallel approvals." },
            { icon: "📊", title: "Expense Monitoring", desc: "Track, filter, and override expenses with admin-level control." },
            { icon: "🔒", title: "Role-Based Access", desc: "Admin, Manager, and Employee tiers with secure data isolation." },
          ].map((f) => (
            <div key={f.title} className="mac-card" style={{ padding: 20, textAlign: "left" }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "var(--mac-text-primary)" }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "var(--mac-text-secondary)", lineHeight: 1.55 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid var(--mac-border)", padding: "16px 24px", textAlign: "center" }}>
        <span style={{ fontSize: 12, color: "var(--mac-text-tertiary)" }}>
          © 2025 Reimbursement Management · Built with Convex & Next.js
        </span>
      </footer>
    </div>
  );
}
