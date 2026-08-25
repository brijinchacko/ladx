"use client";

import { PRIORITY_TONE } from "@/components/hmi/widget-view";

/**
 * The alarm popup, inside the panel.
 *
 * Drawn within the screen's own bounds rather than over the application,
 * because on real hardware there is nothing outside the glass: a dialog that
 * escaped the panel would be a dialog the operator cannot reach.
 *
 * Two rules from the research shape it. The banner must never be obscured, so
 * this sits below the top strip and above the bottom one rather than centred
 * over everything. And a popup that interrupts is only justified for something
 * that genuinely cannot wait, so it is opt-in per priority and defaults to
 * critical only. An HMI that pops a dialog for every low-priority event is one
 * where the operator learns to dismiss without reading, which is worse than
 * having no popup at all.
 *
 * It never blocks the screen underneath. Acknowledging dismisses it; so does
 * Close, which leaves the alarm outstanding in the summary where it belongs.
 */

export interface PopupAlarm {
  id: string;
  message: string;
  priority: string;
  state: string;
  needsAck: boolean;
  raisedAt?: number;
  response?: string;
}

export default function AlarmPopup({
  alarms,
  width,
  onAck,
  onClose,
  bannerInset = 0,
}: {
  alarms: PopupAlarm[];
  /** The screen's width, so the dialog is sized to the glass. */
  width: number;
  onAck: (id: string) => void;
  onClose: (id: string) => void;
  /** Pixels to leave clear at the top, where a banner usually sits. */
  bannerInset?: number;
}) {
  if (alarms.length === 0) return null;
  const a = alarms[0] as PopupAlarm;
  const tone = PRIORITY_TONE[a.priority] ?? PRIORITY_TONE.medium;

  return (
    <div
      style={{
        position: "absolute",
        top: bannerInset + 12,
        left: "50%",
        transform: "translateX(-50%)",
        width: Math.min(width - 40, 420),
        zIndex: 30,
        background: "#fff",
        border: `2px solid ${tone?.line}`,
        borderRadius: 3,
        boxShadow: "0 8px 28px rgba(15,26,36,0.32)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: tone?.bg,
          color: tone?.ink,
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
        }}
      >
        <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>
          {tone?.glyph}
        </span>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11 }}>
          {a.priority}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
          {a.raisedAt ? new Date(a.raisedAt).toLocaleTimeString("en-GB") : ""}
        </span>
        {alarms.length > 1 && (
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>
            1 of {alarms.length}
          </span>
        )}
      </div>

      <div style={{ padding: "10px 12px" }}>
        <p style={{ margin: 0, fontSize: 14, color: "#0F1A24", fontWeight: 500 }}>{a.message}</p>
        {a.response && (
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#4A5A68", lineHeight: 1.45 }}>
            {a.response}
          </p>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "0 12px 10px",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={() => onClose(a.id)}
          style={{
            padding: "5px 12px",
            fontSize: 12.5,
            border: "1px solid #D5DCE2",
            background: "#fff",
            color: "#4A5A68",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => onAck(a.id)}
          style={{
            padding: "5px 14px",
            fontSize: 12.5,
            border: "none",
            background: "#0F1A24",
            color: "#fff",
            borderRadius: 3,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}
