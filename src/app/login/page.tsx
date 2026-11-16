import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Callout, Card, CardBody } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth/current";
import { config } from "@/lib/config";
import { DEMO_ACCOUNTS } from "@/lib/seed";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentActor()) redirect("/");
  const signInReady = Boolean(config.authSecret);
  const demoReady = config.seedDemo && Boolean(config.demoPassword);
  // The development default password is shown to make local demos one click; a configured password never is.
  const devPassword = !config.isProduction && !process.env.DEMO_PASSWORD ? config.demoPassword : undefined;
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-[15px] font-semibold text-accent-fg">PA</div>
          <h1 className="text-xl font-semibold text-fg">Project Aid</h1>
          <p className="mt-1 text-[13px] text-muted">One place to see every project you direct.</p>
        </div>
        <Card>
          <CardBody className="space-y-4">
            {!signInReady && (
              <Callout tone="danger" title="Sign-in is not configured">
                Set the AUTH_SECRET environment variable and redeploy.
              </Callout>
            )}
            {signInReady && config.seedDemo && !demoReady && (
              <Callout tone="warning" title="Demo accounts are disabled">
                Set DEMO_PASSWORD to enable the seeded demo accounts.
              </Callout>
            )}
            <LoginForm accounts={demoReady ? DEMO_ACCOUNTS.map(({ name, email, note }) => ({ name, email, note })) : []} devPassword={devPassword} />
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-[12px] text-subtle">Access is limited to project directors. Every action is recorded in the audit log.</p>
      </div>
    </main>
  );
}
