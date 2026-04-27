import { AuthForm } from "@/components/auth-form";
import { Suspense } from "react";

export const metadata = { title: "Sign in · ladX.ai" };

export default function SignInPage() {
  return (
    <Suspense>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
