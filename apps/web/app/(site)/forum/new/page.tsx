import ThreadForm from "@/components/forum/thread-form";
import { Eyebrow } from "@/components/site/squares";
import { SITE } from "@/lib/seo/schema";
import Link from "next/link";

export const metadata = {
  title: "Start a thread",
  description: "Ask a question about ladder logic, PLC platforms, safety, HMI or commissioning.",
  alternates: { canonical: `${SITE.url}/forum/new` },
  robots: { index: false },
};

export default async function NewThreadPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <nav className="mb-8 font-mono text-[11.5px] text-ink-400">
        <Link href="/forum" className="transition-colors hover:text-ink-700">
          Forum
        </Link>
      </nav>

      <header className="mb-9">
        <Eyebrow>New thread</Eyebrow>
        <h1 className="font-display text-[2rem] font-extrabold leading-[1.06] tracking-[-0.02em] text-ink-900">
          Ask your question
        </h1>
        <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-ink-600">
          The questions that get answered fastest name the platform, say what was expected, and say
          what happened instead. If it is a logic problem, paste the rung.
        </p>
      </header>

      <ThreadForm defaultCategory={category} />
    </div>
  );
}
