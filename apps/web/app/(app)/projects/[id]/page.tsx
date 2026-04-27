interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight mb-2">Project {id}</h1>
      <p className="text-ink-500">
        Project detail view (routine list, tag browser, chat) ships in the next Phase 1 sub-task.
      </p>
    </div>
  );
}
