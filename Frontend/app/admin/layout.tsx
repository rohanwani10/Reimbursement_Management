"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const user = useQuery(api.auth.current);
  const pathname = usePathname();

  const navItems = [
    {
      href: "/admin",
      label: "Organization",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: "/admin/policies",
      label: "Approval Policies",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M9 12l2 2 4-4M5 5h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: "/admin/expenses",
      label: "Expenses",
      icon: (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6v8M7.5 8.5c0-1.1.9-1.5 2.5-1.5s2.5.7 2.5 1.5-.9 1.5-2.5 1.5S7.5 10.6 7.5 11.5 8.4 13 10 13s2.5-.4 2.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

  /* ── Loading ── */
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
          <p style={{ fontSize: 13, color: "var(--mac-text-secondary)" }}>Loading admin dashboard…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ── Access denied ── */
  if (user === null || user.role !== "admin") {
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
        <div
          className="mac-card mac-fade-in"
          style={{ maxWidth: 400, width: "100%", padding: 40, textAlign: "center" }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--mac-red-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--mac-red)" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 3h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--mac-text-primary)" }}>
            Access Denied
          </h1>
          <p style={{ fontSize: 13, color: "var(--mac-text-secondary)", marginBottom: 28, lineHeight: 1.6 }}>
            You don&apos;t have administrative privileges to access this area.
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

  /* ── Admin Shell ── */
  return (
    <div style={{ minHeight: "100vh", background: "var(--mac-bg)", display: "flex", flexDirection: "column" }}>
      {/* Title Bar */}
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
        {/* Left: traffic lights + brand */}
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
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="white" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="white" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="white" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="white" />
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em", color: "var(--mac-text-primary)" }}>
            Admin Panel
          </span>
        </div>

        {/* Center: Nav */}
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

        {/* Right: user */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ThemeToggle />
          <span style={{ fontSize: 12, color: "var(--mac-text-secondary)" }}>{user.name}</span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Content */}
      <main
        className="mac-fade-in"
        style={{ flex: 1, padding: "28px 28px", maxWidth: 1200, width: "100%", margin: "0 auto" }}
      >
        {children}
      </main>
    </div>
  );
}
