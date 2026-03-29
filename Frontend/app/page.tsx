"use client";

import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export default function Home() {
  const bootstrapState = useQuery(api.companies.getBootstrapState, {});

  return (
    <>
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        Reimbursement Management
        <UserButton />
      </header>
      <main className="p-8 flex flex-col gap-8">
        <h1 className="text-4xl font-bold text-center">Backend Foundation Ready</h1>
        <Authenticated>
          <AuthenticatedState
            bootstrapState={bootstrapState ?? null}
          />
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </main>
    </>
  );
}

function SignInForm() {
  return (
    <div className="flex flex-col gap-8 w-96 mx-auto">
      <p>Sign in to bootstrap a company and start backend domain operations.</p>
      <SignInButton mode="modal">
        <button className="bg-foreground text-background px-4 py-2 rounded-md">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="bg-foreground text-background px-4 py-2 rounded-md">
          Sign up
        </button>
      </SignUpButton>
    </div>
  );
}

function AuthenticatedState({
  bootstrapState,
}: {
  bootstrapState: {
    authenticated: boolean;
    provisioned: boolean;
    companyId: string | null;
    userId: string | null;
  } | null;
}) {
  if (!bootstrapState) {
    return (
      <div className="mx-auto">
        <p>Loading session state...</p>
      </div>
    );
  }

  if (!bootstrapState.provisioned) {
    return (
      <div className="max-w-xl mx-auto rounded-xl border border-slate-300 p-6">
        <h2 className="text-xl font-semibold mb-2">Provisioning Required</h2>
        <p>
          This identity is authenticated but not provisioned in Convex yet. Run the
          company bootstrap mutation from your admin UI or API client.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-lg mx-auto">
      <p>Provisioned user id: {bootstrapState.userId}</p>
      <p>Provisioned company id: {bootstrapState.companyId}</p>
      <p className="text-sm opacity-80">
        The Convex backend now uses domain modules for companies, users, rules,
        expenses, approvals, OCR integration seam, and reporting.
      </p>
    </div>
  );
}
