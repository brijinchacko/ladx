import StudioClient from "./studio-client";

export const metadata = {
  title: "Studio",
  description: "Draw ladder logic and watch it run, in the browser.",
};

/**
 * The ladder workbench, standalone.
 *
 * No account and no database: Studio keeps the project in the browser, which is
 * what makes this openable from a cold link. The signed-in version passes an
 * HTTP-backed store instead, and the component cannot tell the difference.
 */
export default function StudioPage() {
  return <StudioClient />;
}
