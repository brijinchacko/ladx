import { Button, Logo } from "@ladx/ui";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-ink-900 flex flex-col items-center justify-center gap-8 p-8">
      <Logo size={52} />
      <h1 className="text-3xl font-semibold tracking-tight text-center max-w-xl">
        The AI workbench for automation engineers.
      </h1>
      <p className="text-ink-500 max-w-md text-center">
        Draw ladder logic and watch it run. Generate PLC code that compiles before you see it. Move
        programs between platforms. Bring your own AI key.
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
