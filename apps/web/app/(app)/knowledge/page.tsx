import KnowledgeClient from "./knowledge-client";

export const metadata = {
  title: "Knowledge",
  description:
    "Index your manuals and ask them questions, with the passage every answer came from.",
};

export default function KnowledgePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <header className="mb-9 max-w-2xl">
        <p className="mb-2 font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-teal-700">
          Knowledge
        </p>
        <h1 className="font-display text-[2rem] font-extrabold leading-[1.06] tracking-[-0.02em] text-ink-900">
          Your manuals, answering questions
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-ink-600">
          Index the drive manual, the machine spec, the site standard. Ask against them and get the
          passage the answer came from, so you can check it rather than take it on trust.
        </p>
      </header>
      <KnowledgeClient />
    </div>
  );
}
