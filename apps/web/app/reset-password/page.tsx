import { ResetPasswordForm } from "@/components/reset-password-form";
import { Suspense } from "react";

export const metadata = { title: "Reset password · ladX.ai" };

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
