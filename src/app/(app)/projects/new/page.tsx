import { PageHeader } from "@/components/ui";
import { NewProjectForm } from "@/components/features/settings/new-project-form";
import { requireActor } from "@/lib/auth/current";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireActor();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New project"
        description="Start with the basics. Next you will connect your sources and add your team."
        breadcrumbs={[{ label: "Portfolio", href: "/" }, { label: "New project" }]}
      />
      <NewProjectForm />
    </div>
  );
}
