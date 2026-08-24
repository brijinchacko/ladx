import ConvertClient from "@/app/(site)/convert/convert-client";
import { WorkspaceHeader } from "@/components/studio/workspace-header";

export const dynamic = "force-dynamic";

/**
 * Convert, inside Studio.
 *
 * The same client component the public page uses. It runs entirely in the
 * browser either way, so there is nothing to duplicate: only the chrome around
 * it differs.
 */
export default function StudioConvertPage() {
  return (
    <>
      <WorkspaceHeader
        title="Convert"
        subtitle="Ladder into Structured Text, SCL, neutral text or PLCopen XML. Runs in your browser."
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <ConvertClient />
      </div>
    </>
  );
}
