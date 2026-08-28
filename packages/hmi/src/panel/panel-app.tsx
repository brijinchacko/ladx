"use client";

import type { LadxProgram } from "@ladx/studio/lib/types";
import { useMemo, useState } from "react";
import AlarmPopup from "../components/alarm-popup";
import WidgetView from "../components/widget-view";
import { needsAck } from "../lib/alarms";
import { expandInstance } from "../lib/faceplates";
import { usePanelRuntime } from "../lib/panel-runtime";
import type { HmiDoc, Widget } from "../lib/types";

/**
 * The screen, running, with nothing around it.
 *
 * This is what an exported panel is: the same document, the same scan engine
 * and the same renderer as the builder, minus the palette, the properties pane
 * and every affordance for changing anything. It draws no chrome of its own
 * beyond a screen selector, because a panel does not have chrome. The glass is
 * the application.
 *
 * It runs from the moment it loads. There is no Run button, since a panel that
 * has to be started is not a panel; and no Stop, because stopping is what
 * closing the page does.
 *
 * Nothing here reaches the network. The document and the program are inlined
 * into the page at export, so the file works from a USB stick, from a share,
 * or on a machine that has never had an internet connection, which is the
 * normal condition of the machine this ends up on.
 */

export interface PanelAppProps {
  doc: HmiDoc;
  program: LadxProgram | null;
  /**
   * Whether to fit the screen to the window.
   *
   * A panel is a fixed number of pixels and the display it lands on rarely
   * matches. Scaling keeps the whole glass visible, which is what somebody
   * opening the file on a laptop wants; the aspect ratio is preserved, so a
   * screen drawn for a wide panel is letterboxed rather than stretched.
   */
  fit?: boolean;
}

export default function PanelApp({ doc, program, fit = true }: PanelAppProps) {
  /**
   * What the panel is operated as.
   *
   * The builder defaults to engineer, because somebody drawing a screen has to
   * see every control on it. A panel is the opposite case: it is being used,
   * not built, so anything the author gated behind a role stays gated unless
   * the document names one. Defaulting the other way would mean a control
   * marked for an engineer appears on the line, which is the failure the role
   * was added to prevent.
   */
  const role = doc.role ?? "operate";
  const [screenId, setScreenId] = useState(doc.screens[0]?.id ?? "");
  const screen = doc.screens.find((s) => s.id === screenId) ?? doc.screens[0];

  const rt = usePanelRuntime({
    doc,
    program,
    running: true,
    onGoToScreen: (slug) => {
      const target = doc.screens.find((s) => s.slug === slug);
      if (target) setScreenId(target.id);
    },
  });

  /*
   * Faceplate instances, expanded once per render.
   *
   * The same computation the editor does, and for the same reason: expansion
   * walks every widget of every definition, and doing it per instance per
   * frame is the sort of thing that makes a panel feel slow for no reason
   * anybody can see.
   */
  const { parts, expandedIds } = useMemo(() => {
    const ids = new Set<string>();
    const out: Widget[] = [];
    for (const w of screen?.widgets ?? []) {
      if (w.kind !== "faceplate") continue;
      const { widgets } = expandInstance(w, doc.faceplates ?? []);
      if (widgets.length && widgets[0] !== w) {
        ids.add(w.id);
        out.push(...widgets);
      }
    }
    return { parts: out.sort((a, b) => (a.z ?? 0) - (b.z ?? 0)), expandedIds: ids };
  }, [screen?.widgets, doc.faceplates]);

  const [scale, setScale] = useState(1);
  const stage = (el: HTMLDivElement | null) => {
    if (!el || !screen || !fit) return;
    const measure = () => {
      const sx = el.clientWidth / screen.size.width;
      const sy = el.clientHeight / screen.size.height;
      setScale(Math.max(0.1, Math.min(sx, sy)));
    };
    measure();
    // A panel display does not usually resize, but a browser window does, and
    // an exported file opened on a laptop is a browser window.
    new ResizeObserver(measure).observe(el);
  };

  if (!screen) {
    return (
      <div style={shell}>
        <p style={{ font: "14px ui-sans-serif, system-ui", color: "#8A97A3" }}>
          This application has no screens.
        </p>
      </div>
    );
  }

  return (
    <div style={shell}>
      {doc.screens.length > 1 && (
        <nav style={nav}>
          {doc.screens.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScreenId(s.id)}
              style={{ ...navBtn, ...(s.id === screen.id ? navBtnOn : null) }}
            >
              {s.name}
            </button>
          ))}
        </nav>
      )}

      <div ref={stage} style={stageBox}>
        <div
          style={{
            width: screen.size.width,
            height: screen.size.height,
            background: screen.background,
            position: "relative",
            transform: `scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          {parts.map((w) => (
            <WidgetView
              key={w.id}
              widget={w}
              ctx={rt.ctx}
              live
              role={role}
              defaultStyle={doc.symbolStyle ?? "schematic"}
              data={rt.liveData(w)}
              onPress={() => rt.fire(w.onPress)}
              onRelease={() => rt.fire(w.onRelease)}
            />
          ))}

          {[...screen.widgets]
            .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
            .filter((w) => !(w.kind === "faceplate" && expandedIds.has(w.id)))
            .map((w) => (
              <WidgetView
                key={w.id}
                widget={w}
                ctx={rt.ctx}
                live
                role={role}
                defaultStyle={doc.symbolStyle ?? "schematic"}
                data={rt.liveData(w)}
                onPress={() => rt.fire(w.onPress)}
                onRelease={() => rt.fire(w.onRelease)}
              />
            ))}

          <AlarmPopup
            alarms={rt.popped.map((r) => ({
              id: r.def.id,
              message: r.def.message,
              priority: r.def.priority,
              state: r.runtime.state,
              needsAck: needsAck(r.runtime.state),
              raisedAt: r.runtime.raisedAt,
              response: r.def.response,
            }))}
            width={screen.size.width}
            // Cleared under the topmost banner on this screen, so the dialog
            // never covers the one thing that has to stay visible.
            bannerInset={Math.max(
              0,
              ...screen.widgets
                .filter((x) => x.kind === "alarmBanner")
                .map((x) => x.rect.y + x.rect.h),
            )}
            onAck={rt.ackOne}
            onClose={rt.dismiss}
          />
        </div>
      </div>
    </div>
  );
}

/*
 * Styles as objects rather than classes.
 *
 * The exported file carries no stylesheet: the widget renderer has always
 * drawn with inline styles, and keeping the shell the same way is what lets
 * one HTML file be the whole panel with nothing to fetch.
 */
const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: "#0F1A24",
  font: "14px ui-sans-serif, system-ui, -apple-system, sans-serif",
};

const stageBox: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const nav: React.CSSProperties = {
  display: "flex",
  gap: 2,
  padding: "6px 8px",
  background: "#0B141C",
  flexShrink: 0,
};

const navBtn: React.CSSProperties = {
  border: "1px solid #24313D",
  background: "transparent",
  color: "#9FB0BE",
  padding: "4px 10px",
  borderRadius: 3,
  font: "12.5px ui-sans-serif, system-ui, sans-serif",
  cursor: "pointer",
};

const navBtnOn: React.CSSProperties = {
  background: "#3FBFB5",
  borderColor: "#3FBFB5",
  color: "#0F1A24",
};
