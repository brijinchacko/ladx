/**
 * What there is to download, in one place.
 *
 * The version, the files and whether a platform has a build yet are facts the
 * download page, the header link and the sitemap all need to agree on. Kept
 * here so adding a build is one edit rather than four, and so a platform
 * without a build says so instead of offering a link that 404s.
 */

/**
 * The version this site is actually serving.
 *
 * Deliberately not "the version in tauri.conf.json". Those are two different
 * facts and this is the one the page needs: bumping this the moment the app
 * version changed put two dead links on a live download page, because the
 * installers for the new version had not been built yet, let alone uploaded.
 *
 * Bump it after the files are on the server, never before, and check the
 * checksums below at the same time.
 *
 * "On the server" also means after a restart. `next start` indexes public/
 * once at startup, so an installer copied in afterwards is on disk and still
 * 404s until the process comes back.
 */
export const DESKTOP_VERSION = "0.3.0";

/** Where the installers are served from. */
const BASE = "/downloads";

export interface DesktopBuild {
  id: "mac" | "windows";
  /** As a person would say it, not as a build system would. */
  platform: string;
  /** The installer's own name, shown so somebody knows what landed. */
  file: string | null;
  /** Absolute path on this site, or null when there is no build yet. */
  href: string | null;
  /** Rounded, for the button. Null when there is nothing to size. */
  size: string | null;
  /**
   * SHA-256 of the installer.
   *
   * Published because the build is not signed yet. Without a signature this is
   * the only way somebody can check that what they downloaded is what we
   * built, and an engineer installing unsigned software on a plant machine is
   * entitled to that check.
   */
  sha256: string | null;
  /** What it runs on. */
  requires: string;
  /**
   * Whether the installer is signed.
   *
   * Stated rather than hidden. An unsigned build makes the operating system
   * warn the person running it, and someone who was not told that reasonably
   * concludes the download is malicious and stops.
   */
  signed: boolean;
  /** Why there is no build, when there is no build. */
  pending: string | null;
}

export const DESKTOP_BUILDS: DesktopBuild[] = [
  {
    id: "mac",
    platform: "macOS",
    file: `LADX-Studio-${DESKTOP_VERSION}-universal.dmg`,
    href: `${BASE}/LADX-Studio-${DESKTOP_VERSION}-universal.dmg`,
    size: "9.1 MB",
    sha256: "8599c3d7a22eb68a51c8646c361b8aa3a646d8c463e2699bcf86383cf7028147",
    requires: "macOS 11 or later. Apple Silicon and Intel in one download.",
    signed: false,
    pending: null,
  },
  {
    id: "windows",
    platform: "Windows",
    file: `LADX-Studio-${DESKTOP_VERSION}-x64.msi`,
    href: `${BASE}/LADX-Studio-${DESKTOP_VERSION}-x64.msi`,
    size: "4.8 MB",
    sha256: "21a3d579e6cd342c8fc8810c122abb4395c9460db9ca2228d537b26d601339bd",
    requires: "Windows 10 or later, 64 bit.",
    signed: false,
    pending: null,
  },
];

export function buildFor(id: DesktopBuild["id"]): DesktopBuild {
  const found = DESKTOP_BUILDS.find((b) => b.id === id);
  if (!found) throw new Error(`no build ${id}`);
  return found;
}

/** True when at least one platform can actually be downloaded. */
export const HAS_ANY_BUILD = DESKTOP_BUILDS.some((b) => b.href !== null);
