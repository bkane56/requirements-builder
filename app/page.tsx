import RequirementsBuilder from "@/components/requirements-builder";
import { loadTemplates } from "@/lib/load-templates";

// Fails the build if this route stops being fully prerendered, which would require runtime template file access.
export const ensureStatic = "navigation";

export default function Page() {
  return (
    <main>
      <h1>Requirements Builder</h1>
      <RequirementsBuilder templates={loadTemplates()} />
    </main>
  );
}
