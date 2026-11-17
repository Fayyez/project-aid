"use client";

import { useActionState, useState } from "react";
import { loginAction } from "@/app/actions";
import { Button, Field, Input } from "@/components/ui";

interface Account {
  name: string;
  email: string;
  note: string;
}

export function LoginForm({ accounts, devPassword }: { accounts: Account[]; devPassword?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form action={formAction} className="space-y-4">
      <Field label="Email">
        <Input name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
      </Field>
      <Field label="Password" error={state?.error}>
        <Input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>
      <Button type="submit" variant="primary" loading={pending} className="w-full justify-center">
        Sign in
      </Button>
      {accounts.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-[12px] font-medium text-muted">Demo accounts{devPassword ? "" : " (ask the presenter for the password)"}</p>
          <ul className="space-y-1.5">
            {accounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    if (devPassword) setPassword(devPassword);
                  }}
                  className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-left transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block text-[13px] font-medium text-fg">{account.name}</span>
                  <span className="block text-[12px] text-muted">{account.note}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
