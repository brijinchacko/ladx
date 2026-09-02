"use client";

import { type AuthMode, AuthPanel } from "@/components/auth/auth-panel";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@ladx/ui";
import { usePathname } from "next/navigation";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

export interface OpenAuthOptions {
  /** Which form to show first. Either one can be reached from the other. */
  mode?: AuthMode;
  /**
   * Where to go once they are in.
   *
   * Left out, it is wherever they already were, which is the point of the
   * dialog: somebody halfway down an article who signs in should come back to
   * the same paragraph, not to the projects list.
   */
  next?: string;
}

interface AuthModalApi {
  open: (options?: OpenAuthOptions) => void;
  close: () => void;
}

const AuthModalContext = createContext<AuthModalApi | null>(null);

/**
 * Signing in without leaving the page.
 *
 * /sign-in and /sign-up are still real routes and still work on their own: a
 * server redirect for a protected page lands on them, a magic link that fails
 * comes back to them, and anyone without JavaScript gets them by following the
 * link. This is the same form over the page somebody is already reading, for
 * the far more common case where they clicked a button rather than being sent.
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<{ mode: AuthMode; next: string } | null>(null);

  const open = useCallback(
    (options?: OpenAuthOptions) => {
      setState({
        mode: options?.mode ?? "sign-in",
        next: options?.next ?? pathname ?? "/projects",
      });
    },
    [pathname],
  );

  const close = useCallback(() => setState(null), []);
  const api = useMemo(() => ({ open, close }), [open, close]);

  return (
    <AuthModalContext.Provider value={api}>
      {children}
      <Dialog open={state !== null} onOpenChange={(next) => !next && close()}>
        {state && (
          <DialogContent
            /*
              Inset from the edges and never taller than the screen.

              The default content box is `w-full`, which on a 375px phone puts
              the rounded corners past the edge of the glass, and the sign-up
              form is 526px tall, which does not fit a phone held sideways. The
              first is cosmetic; the second means the Create account button is
              below the fold with nothing to scroll.
            */
            className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto p-8"
          >
            <AuthPanel
              /*
                Remounted when the form changes, so the fields do not carry
                over. A password typed into the sign-in form should not still
                be sitting there after somebody decides to make an account.
              */
              key={state.mode}
              mode={state.mode}
              next={state.next}
              onModeChange={(mode) => setState((s) => (s ? { ...s, mode } : s))}
              onDone={close}
              titleAs={DialogTitle}
              descriptionAs={DialogDescription}
            />
          </DialogContent>
        )}
      </Dialog>
    </AuthModalContext.Provider>
  );
}

/**
 * Opens the sign-in dialog, when there is one.
 *
 * Returns null outside the provider rather than throwing, so a component that
 * offers to sign somebody in can still be rendered in a test or on a page
 * without the site chrome. Every caller falls back to the real route.
 */
export function useAuthModal(): AuthModalApi | null {
  return useContext(AuthModalContext);
}
