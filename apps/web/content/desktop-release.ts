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
 */
export const DESKTOP_VERSION = "0.1.0";

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
    size: "8.3 MB",
    sha256: "856f3ac32f082fe67bbaffaa3718005ca2c267d60e9e4b9a4b8e0c985a17e3eb",
    requires: "macOS 11 or later. Apple Silicon and Intel in one download.",
    signed: false,
    pending: null,
  },
  {
    id: "windows",
    platform: "Windows",
    file: `LADX-Studio-${DESKTOP_VERSION}-x64.msi`,
    href: `${BASE}/LADX-Studio-${DESKTOP_VERSION}-x64.msi`,
    size: "4.4 MB",
    sha256: "85734cf732ead7257765633e960736ef22ea55358f0628319318191b0f8e9443",
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
