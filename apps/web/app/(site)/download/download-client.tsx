"use client";

import {
  DESKTOP_BUILDS,
  DESKTOP_VERSION,
  type DesktopBuild,
  buildFor,
} from "@/content/desktop-release";
import { AlertTriangle, ArrowRight, Check, Cloud, Download, Info, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Which platform the visitor is on.
 *
 * Guessed, and never used to hide the other one. A guess is right often enough
 * to save most people a decision and wrong often enough that the other build
 * has to stay one click away: engineers browse from a laptop and install on a
 * different machine all the time.
 */
function guessPlatform(): DesktopBuild["id"] | null {
  if (typeof navigator === "undefined") return null;
  const s = `${navigator.userAgent} ${navigator.platform ?? ""}`.toLowerCase();
  if (s.includes("mac")) return "mac";
  if (s.includes("win")) return "windows";
  return null;
}

const SEEN_KEY = "ladx.download.webnotice";

export default function DownloadClient() {
  const [platform, setPlatform] = useState<DesktopBuild["id"] | null>(null);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    const guess = guessPlatform();
    setPlatform(guess);

    /*
     * The web app, said once.
     *
     * Shown on the first visit and then remembered, because the point is to
     * tell somebody who does not know that there is a version with nothing to
     * install. Repeating it on every visit to a page they came to deliberately
     * would be nagging them out of the thing they came for.
     *
     * Raised straight away when their own platform has no build yet: that
     * person cannot do what they came to do, and the browser is the answer.
     */
    try {
      const unavailable = guess !== null && buildFor(guess).href === null;
      if (unavailable || window.localStorage.getItem(SEEN_KEY) !== "1") setNotice(true);
    } catch {
      // A browser with storage blocked still gets told, it just gets told again.
      setNotice(true);
    }
  }, []);

  const dismiss = () => {
    setNotice(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Nothing to do. The notice is a courtesy, not state worth an error.
    }
  };

  // The guessed platform first, so the button somebody wants is the one at the
  // top of the page rather than the one that happens to be first in the list.
  const ordered = platform
    ? [buildFor(platform), ...DESKTOP_BUILDS.filter((b) => b.id !== platform)]
    : DESKTOP_BUILDS;

  return (
    <>
      <header className="mb-10 max-w-2xl">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400">
          LADX Studio {DESKTOP_VERSION}
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">
          The desktop build, for work that cannot leave the building
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-600">
          The ladder editor, the simulator, CAD, the HMI builder, Convert and the document pack,
          running on your own machine. Inference is a local Ollama model, so prompts, programs and
          drawings stay on the computer. After the licence check on first run it needs no network at
          all.
        </p>
      </header>

      <div className="mb-12 grid gap-4 sm:grid-cols-2">
        {ordered.map((b) => (
          <BuildCard
            key={b.id}
            build={b}
            suggested={b.id === platform}
            onWeb={() => setNotice(true)}
          />
        ))}
      </div>

      <section className="mb-12 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold text-ink-900">Before you install</h2>
          <ul className="space-y-2 text-[13.5px] leading-relaxed text-ink-600">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
              <span>
                <a
                  href="https://ollama.com/download"
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-600 underline underline-offset-2"
                >
                  Ollama
                </a>{" "}
                installed and running. LADX does not bundle it: the model weights alone are
                gigabytes, and they are not ours to redistribute.
              </span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
              <span>
                A licence key, entered once. That and the update check, which is off unless you
                switch it on, are the only times it uses the network.
              </span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-500" />
              <span>
                A folder for your projects. Each one becomes a real directory you can back up, put
                on a stick and hand over.
              </span>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 font-semibold text-ink-900">What is not in it yet</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-600">
            The planner, clients and the knowledge base are on the web app and not yet on the
            desktop. This release carries the tools that run with no server at all: ladder, monitor,
            CAD, HMI/SCADA, Convert and Documents.
          </p>
          <Link
            href="/products"
            className="mt-3 inline-flex items-center gap-1 text-[13px] text-teal-600 hover:text-teal-700"
          >
            Everything LADX does
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <h2 className="mt-6 mb-2 font-semibold text-ink-900">Updates</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-600">
            Off until you turn them on, in Settings. On, LADX asks this site once per launch whether
            there is a newer version, and every update is signed so one that is not gets refused
            before anything is written. On a machine that is not supposed to reach the internet,
            leave it off and download from here when you want a new version.
          </p>
        </div>
      </section>

      {notice && <WebAppNotice onClose={dismiss} />}
    </>
  );
}

function BuildCard({
  build,
  suggested,
  onWeb,
}: {
  build: DesktopBuild;
  suggested: boolean;
  onWeb: () => void;
}) {
  const available = build.href !== null;
  return (
    <div
      className={`rounded-xl border p-5 ${
        suggested ? "border-teal-500 bg-teal-500/[0.03]" : "border-ink-100"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-semibold text-ink-900">{build.platform}</h2>
        {suggested && (
          <span className="rounded-full bg-teal-500 px-2 py-0.5 text-[11px] font-medium text-teal-600">
            Your computer
          </span>
        )}
      </div>
      <p className="mb-4 text-[12.5px] leading-relaxed text-ink-500">{build.requires}</p>

      {available ? (
        <>
          <a
            href={build.href ?? "#"}
            download
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-ink-900 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            Download for {build.platform}
          </a>
          <p className="mt-2 truncate text-[11.5px] text-ink-400" title={build.file ?? undefined}>
            {build.file} · {build.size}
          </p>
          {build.sha256 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11.5px] text-ink-400 hover:text-ink-600">
                Verify the download
              </summary>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
                SHA-256, compare with <code className="text-ink-600">shasum -a 256</code> on the
                file you downloaded:
              </p>
              <code className="mt-1 block break-all font-mono text-[10.5px] leading-relaxed text-ink-600">
                {build.sha256}
              </code>
            </details>
          )}
          {!build.signed && (
            /*
             * Said on the page rather than discovered at the warning dialog.
             * An unsigned installer makes the operating system tell somebody
             * the app cannot be checked, and a person who was not warned
             * reasonably concludes the download is malicious and stops.
             */
            <p className="mt-3 flex gap-2 rounded-md bg-warning px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>
                Not code signed yet, so {build.platform} will warn you the first time.{" "}
                {build.id === "mac"
                  ? "Right click the app and choose Open, rather than double clicking it."
                  : "SmartScreen shows More info, then Run anyway."}{" "}
                Check the SHA-256 above if you would rather not take our word for it.
              </span>
            </p>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            disabled
            className="flex h-10 w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-ink-200 px-4 text-sm font-medium text-ink-400"
          >
            Not ready yet
          </button>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">{build.pending}</p>
          <button
            type="button"
            onClick={onWeb}
            className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-teal-600 hover:text-teal-700"
          >
            Use it in the browser meanwhile
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The web app, for somebody on the download page who may not need to download.
 *
 * Most people arriving here have not understood that there are two of these
 * and that the browser one is the same tools. Told plainly, including the part
 * that actually decides it for them: where the model runs and where the
 * project lives.
 */
function WebAppNotice({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  /*
   * A real <dialog>, opened with showModal.
   *
   * Rather than a div with role="dialog" and a keydown listener, which is what
   * this was: the element gives focus trapping, Escape, the backdrop and
   * inertness of the page behind it, and gets all four right on screen readers
   * that a hand rolled version does not.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || el.open) return;
    el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="webapp-notice-title"
      className="w-full max-w-lg rounded-xl border border-ink-100 bg-white p-6 text-ink-900 shadow-xl backdrop:bg-ink-900"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-50 hover:text-ink-700"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-teal-500 text-teal-600">
        <Cloud className="h-4 w-4" />
      </div>
      <h2 id="webapp-notice-title" className="mb-2 text-xl font-semibold tracking-tight">
        There is a version with nothing to install
      </h2>
      <p className="mb-4 text-[14px] leading-relaxed text-ink-600">
        LADX runs in the browser as well, with more tools than the desktop build has yet: Documents,
        the planner, clients and the knowledge base are all there. Nothing to install and nothing to
        update.
      </p>

      <div className="mb-5 rounded-lg bg-ink-50 p-4 text-[13px] leading-relaxed text-ink-600">
        <p className="flex gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
          <span>
            The difference that matters: in the browser the model runs in the cloud and your project
            is stored on our servers. On the desktop both stay on your machine. If your site will
            not allow control programs off the premises, the desktop build is the one you want.
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/studio"
          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-teal-500 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Open LADX in the browser
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 items-center justify-center rounded-md border border-ink-200 px-4 text-sm text-ink-700 hover:bg-ink-50"
        >
          Stay on downloads
        </button>
      </div>
    </dialog>
  );
}
