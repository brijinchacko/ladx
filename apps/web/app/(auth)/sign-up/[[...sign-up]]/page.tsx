import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <SignUp />
    </main>
  );
}
