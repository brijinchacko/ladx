import { AuthForm } from "@/components/auth-form";
import { Suspense } from "react";

export const metadata = { title: "Sign up · ladX.ai" };

export default function SignUpPage() {
  return (
    <Suspense>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
