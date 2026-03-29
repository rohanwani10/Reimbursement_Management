"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function ManagerLayout({ children }: { children: ReactNode }) {
  const user = useQuery(api.auth.current);
  const pathname = usePathname();

  const navItems = [
    {
      href: "/manager",
      label: "Approval Queue",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M4 6h12M4 10h12M4 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: "/manager/team-expenses",
      label: "Team Expenses",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="13" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 15c.8-2.1 2.4-3 3.5-3s2.7.9 3.5 3M9.5 15c.8-2.1 2.4-3 3.5-3s2.7.9 3.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: "/employee/expenses",
      label: "My Expenses",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M4 6h12M4 10h12M4 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  if (user?.role === "admin") {
    navItems.push({
      href: "/admin",
      label: "Admin",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    });
  }

  if (user === undefined) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--mac-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "3px solid var(--mac-border-strong)",
              borderTopColor: "var(--mac-accent)",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ fontSize: 13, color: "var(--mac-text-secondary)" }}>Loading manager workspace…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (user === null || (user.role !== "manager" && user.role !== "admin")) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--mac-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div className="mac-card mac-fade-in" style={{ maxWidth: 420, width: "100%", padding: 40, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--mac-text-primary)" }}>
            Access Denied
          </h1>
          <p style={{ fontSize: 13, color: "var(--mac-text-secondary)", marginBottom: 28, lineHeight: 1.6 }}>
            You do not have manager access for this workspace.
          </p>
          <Link href="/">
            <button className="mac-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
              Return to Home
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--mac-bg)", display: "flex", flexDirection: "column" }}>
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
          padding: "0 20px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57", display: "block" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#febc2e", display: "block" }} />
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840", display: "block" }} />
          </div>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: "var(--mac-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 10-8 0v4M7 11h10v9H7z" />
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em", color: "var(--mac-text-primary)" }}>
            Manager Workspace
          </span>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--mac-accent)" : "var(--mac-text-secondary)",
                  background: active ? "var(--mac-accent-alpha)" : "transparent",
                  textDecoration: "none",
                  transition: "all 0.15s",
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeToggle />
          <span style={{ fontSize: 12, color: "var(--mac-text-secondary)", fontWeight: 500 }}>{user.name}</span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <main className="mac-fade-in" style={{ flex: 1, padding: "28px 28px", maxWidth: 1200, width: "100%", margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
