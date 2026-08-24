import LadderClient from "./ladder-client";

export const dynamic = "force-dynamic";

/**
 * Ladder.
 *
 * Deliberately has no WorkspaceHeader: the editor brings its own menu bar
 * (File, Edit, View, History, Help) and stacking a second header above it
 * wastes vertical space on the one tool that needs it most.
 */
export default function LadderPage() {
  return <LadderClient />;
}
