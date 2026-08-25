"use client";

import { PANEL_GROUPS, PANEL_PRESETS, type PanelPreset } from "@/lib/hmi/panels";
import { Clock, Loader2, MonitorCog } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface HmiRow {
  id: string;
  name: string;
  projectId: string | null;
  projectName: string | null;
  screens: number;
  updatedAt: string;
}

/**
 * HMI, before an application is open.
 *
 * The panel comes first because it is the one decision that cannot be undone
 * cheaply. A graphic laid out at 1280x800 and deployed to a 7" panel is not
 * scaled down, it is cut off, and every object placed before that is
 * discovered has to be moved. So the size is picked here, with the resolution
 * stated plainly rather than hidden behind a model number.
 */
export default function HmiHome({
  applications,
  projects,
  defaultProjectId,
}: {
  applications: HmiRow[];
  projects: { id: string; name: string }[];
  defaultProjectId?: string | null;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function create(preset: PanelPreset) {
    setBusy(preset.id);
    try {
      const res = await fetch("/api/hmi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${preset.label} application`,
          projectId: projectId || null,
          width: preset.size.width,
          height: preset.size.height,
        }),
      });
      if (!res.ok) return;
      const { id } = (await res.json()) as { id: string };
      router.push(`/studio/hmi/${id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-md border border-ink-200 bg-ink-50/50 px-4 py-3">
          <MonitorCog className="h-4 w-4 shrink-0 text-teal-600" />
          <span className="text-[13.5px] text-ink-700">New application for</span>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink-500"
          >
            <option value="">no project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name it, or leave blank"
            className="w-52 rounded-md border border-ink-200 bg-white px-2 py-1 text-[13px] outline-none placeholder:text-ink-300 focus:border-ink-500"
          />
          <span className="text-[12.5px] text-ink-400">
            {projectId
              ? "It binds to that project's ladder tags."
              : "Without a project there are no PLC tags to bind to."}
          </span>
        </div>

        {applications.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-2.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
              <Clock className="h-3 w-3" />
              Carry on with
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {applications.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/studio/hmi/${a.id}`}
                    className="group flex h-full flex-col rounded-md border border-ink-200 bg-white p-3 transition-colors hover:border-ink-400"
                  >
                    <span className="truncate text-[13.5px] font-medium text-ink-900 group-hover:text-teal-700">
                      {a.name}
                    </span>
                    <span className="mt-0.5 truncate font-mono text-[10.5px] text-ink-400">
                      {a.projectName ?? "No project"} · {a.screens} screen
                      {a.screens === 1 ? "" : "s"} ·{" "}
                      {new Date(a.updatedAt).toLocaleDateString("en-GB")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="font-display text-[16px] font-bold text-ink-900">Pick the screen</h2>
          <p className="mb-4 mt-0.5 max-w-2xl text-[13px] leading-relaxed text-ink-500">
            A panel is a fixed number of pixels and does not reflow, so this is the first decision
            rather than a setting. Everything after it is drawn to fit.
          </p>

          {PANEL_GROUPS.map((group) => (
            <div key={group} className="mb-5">
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
                {group}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PANEL_PRESETS.filter((p) => p.group === group).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => create(p)}
                      disabled={Boolean(busy)}
                      className="flex h-full w-full flex-col rounded-md border border-ink-200 bg-white p-3 text-left transition-colors hover:border-teal-500 hover:bg-teal-50/30 disabled:opacity-50"
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="font-display text-[13.5px] font-bold text-ink-900">
                          {p.label}
                        </span>
                        <span className="ml-auto font-mono text-[10.5px] tabular-nums text-ink-400">
                          {p.size.width}×{p.size.height}
                        </span>
                        {busy === p.id && (
                          <Loader2 className="h-3 w-3 animate-spin text-teal-600" />
                        )}
                      </span>
                      <span className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
                        {p.note}
                      </span>
                      {/* A scale drawing of the glass, so 480x272 and 1920x1080
                          are visibly different things rather than two numbers. */}
                      <span
                        aria-hidden="true"
                        className="mt-2 block border border-ink-300 bg-ink-100"
                        style={{
                          width: (p.size.width / 1920) * 150,
                          height: (p.size.height / 1920) * 150,
                        }}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
