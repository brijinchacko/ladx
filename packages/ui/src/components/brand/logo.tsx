import { cn } from "../../lib/cn";

export interface LogoProps {
  className?: string;
  size?: number;
}

// Simple wordmark — image-based logo lives at /assets/ladx-logo.png in each app.
export function Logo({ className, size = 32 }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold text-ink-900", className)}>
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="rounded-md bg-teal text-white inline-flex items-center justify-center font-bold"
      >
        L
      </span>
      <span className="tracking-tight">ladX.ai</span>
    </div>
  );
}
