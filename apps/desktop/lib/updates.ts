/**
 * Looking for a new version, only when somebody has asked us to.
 *
 * This is the one place the app is allowed to reach the network besides the
 * licence check, and it is off until turned on. That default is the product:
 * LADX is sold on making no outbound call, and a plant that has air gapped the
 * machine has to be able to rely on that without reading the source. Somebody
 * who would rather have fixes delivered can say so in Settings, and nobody has
 * it decided for them.
 *
 * The manifest is served from ladx.ai alongside the installers. Not from the
 * GitHub release: the repository is private, so its assets need a token, and
 * an updater cannot carry one.
 *
 * Every update is signed, and the public key is compiled into the app. An
 * unsigned or wrongly signed package is refused by the plugin before anything
 * is written to disk, which is what stops this endpoint becoming a way to hand
 * somebody a different program than the one they installed.
 */

import { settingsLoad } from "@/lib/invoke";
import { check } from "@tauri-apps/plugin-updater";

export interface UpdateFound {
  version: string;
  /** What the release said. Shown as-is, so it is worth writing properly. */
  notes: string | null;
  date: string | null;
  /** Downloads, verifies and installs. The app restarts itself afterwards. */
  install: () => Promise<void>;
}

/**
 * Ask whether there is a newer version.
 *
 * Returns null both when there is nothing new and when checking is switched
 * off, because to every caller those are the same answer: nothing to offer.
 * `force` is for the button in Settings, where somebody has just asked
 * explicitly and should not have to enable a setting first to get an answer.
 */
export async function lookForUpdate(force = false): Promise<UpdateFound | null> {
  if (!force) {
    const settings = await settingsLoad().catch(() => ({ checkForUpdates: false }));
    if (!settings.checkForUpdates) return null;
  }

  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
    install: () => update.downloadAndInstall(),
  };
}
