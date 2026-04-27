import { Button, Logo } from "@ladx/ui";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-ink-900 flex flex-col items-center justify-center gap-8 p-8">
      <Logo size={64} />
      <h1 className="text-3xl font-semibold tracking-tight text-center max-w-xl">
        Local-first PLC AI for engineers who don't trust the cloud.
      </h1>
      <p className="text-ink-500 max-w-md text-center">
        Sign in to upload a project, chat about it, and generate validated ST.
      </p>
      <div className="flex gap-3">
        <Link href="/sign-up">
          <Button variant="primary">Try free</Button>
        </Link>
        <Link href="/sign-in">
          <Button variant="outline">Sign in</Button>
        </Link>
      </div>
    </main>
  );
}
