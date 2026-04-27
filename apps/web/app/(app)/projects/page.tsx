import { Button } from "@ladx/ui";

export default function ProjectsPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
          <p className="text-ink-500">Upload an L5X or PLCopen file to get started.</p>
        </div>
        <Button variant="primary">Upload project</Button>
      </header>
      <div className="border border-dashed border-ink-200 rounded-lg p-12 text-center text-ink-500">
        No projects yet. The upload flow lands shortly — Phase 1 in progress.
      </div>
    </div>
  );
}
