import { nid } from "./tree";
import type { LadxProgram } from "./types";

/**
 * Worked examples to open instead of an empty grid.
 *
 * A blank ladder editor is intimidating and teaches nothing. Each of these is a
 * complete, running program taken from what the course already covers, so a
 * student can press Run, watch it work, then take it apart. Copied on open, so
 * the original stays intact for the next person.
 */

export const STARTER_PROGRAMS: {
  key: string;
  name: string;
  description: string;
  program: LadxProgram;
}[] = [
  {
    key: "motor-seal-in",
    name: "Motor start/stop with seal-in",
    description:
      "The first rung every automation engineer learns. Start latches the motor, Stop and E-Stop break it. Notice both stop buttons are wired normally closed, press Run and try turning E-Stop off.",
    program: {
      name: "Motor start/stop with seal-in",
      scanMs: 100,
      tags: [
        {
          name: "Start_PB",
          type: "BOOL",
          value: 0,
          isInput: true,
          comment: "Momentary start button",
        },
        {
          name: "Stop_PB",
          type: "BOOL",
          value: 1,
          isInput: true,
          device: "PUSHBUTTON_NC",
          comment: "NC, 1 means healthy",
        },
        {
          name: "EStop_OK",
          type: "BOOL",
          value: 1,
          isInput: true,
          device: "PUSHBUTTON_NC",
          comment: "NC, 1 means healthy",
        },
        {
          name: "Motor",
          type: "BOOL",
          value: 0,
          isOutput: true,
          device: "MOTOR",
          comment: "Motor contactor",
        },
      ],
      rungs: [
        {
          id: "r1",
          comment: "Start latches; the second branch is the seal-in that holds it on.",
          branches: [
            [
              { id: "e1", type: "XIC", tag: "Start_PB" },
              { id: "e2", type: "XIC", tag: "Stop_PB" },
              { id: "e3", type: "XIC", tag: "EStop_OK" },
            ],
            [
              { id: "e4", type: "XIC", tag: "Motor" },
              { id: "e5", type: "XIC", tag: "Stop_PB" },
              { id: "e6", type: "XIC", tag: "EStop_OK" },
            ],
          ],
          outputs: [{ id: "o1", type: "OTE", tag: "Motor" }],
        },
      ],
    },
  },

  {
    key: "conveyor-timer",
    name: "Conveyor runs for 10 seconds",
    description:
      "Press Start and the conveyor runs, then stops by itself after ten seconds. Shows a TON timing while powered, and its done bit breaking the latch.",
    program: {
      name: "Conveyor runs for 10 seconds",
      scanMs: 100,
      tags: [
        { name: "Start_PB", type: "BOOL", value: 0, isInput: true },
        {
          name: "Stop_PB",
          type: "BOOL",
          value: 1,
          isInput: true,
          device: "PUSHBUTTON_NC",
          comment: "NC",
        },
        { name: "Conveyor", type: "BOOL", value: 0, isOutput: true },
        { name: "RunTimer", type: "TIMER", value: 0, preset: 10000, acc: 0, comment: "10 s" },
      ],
      rungs: [
        {
          id: "r1",
          comment: "Latch the conveyor. RunTimer.DN drops it out when the time is up.",
          branches: [
            [
              { id: "a1", type: "XIC", tag: "Start_PB" },
              { id: "a2", type: "XIC", tag: "Stop_PB" },
              { id: "a3", type: "XIO", tag: "RunTimer.DN" },
            ],
            [
              { id: "a4", type: "XIC", tag: "Conveyor" },
              { id: "a5", type: "XIC", tag: "Stop_PB" },
              { id: "a6", type: "XIO", tag: "RunTimer.DN" },
            ],
          ],
          outputs: [{ id: "b1", type: "OTE", tag: "Conveyor" }],
        },
        {
          id: "r2",
          comment: "The timer runs only while the conveyor does.",
          branches: [[{ id: "c1", type: "XIC", tag: "Conveyor" }]],
          outputs: [{ id: "d1", type: "TON", tag: "RunTimer", preset: 10000 }],
        },
      ],
    },
  },

  {
    key: "bottle-counter",
    name: "Count 12 bottles, then flag the batch",
    description:
      "A photocell counts parts. Toggle the sensor on and off, notice that holding it on counts once, not continuously, because a CTU counts on the rising edge.",
    program: {
      name: "Count 12 bottles, then flag the batch",
      scanMs: 100,
      tags: [
        {
          name: "Photocell",
          type: "BOOL",
          value: 0,
          isInput: true,
          comment: "One pulse per bottle",
        },
        { name: "Reset_PB", type: "BOOL", value: 0, isInput: true },
        { name: "BatchCount", type: "COUNTER", value: 0, preset: 12, acc: 0 },
        { name: "Batch_Done", type: "BOOL", value: 0, isOutput: true },
      ],
      rungs: [
        {
          id: "r1",
          comment: "Counts on each rising edge of the photocell.",
          branches: [[{ id: "a", type: "XIC", tag: "Photocell" }]],
          outputs: [{ id: "b", type: "CTU", tag: "BatchCount", preset: 12 }],
        },
        {
          id: "r2",
          comment: "Batch complete when the counter reaches its preset.",
          branches: [[{ id: "c", type: "XIC", tag: "BatchCount.DN" }]],
          outputs: [{ id: "d", type: "OTE", tag: "Batch_Done" }],
        },
        {
          id: "r3",
          comment: "Clear the counter to start the next batch.",
          branches: [[{ id: "e", type: "XIC", tag: "Reset_PB" }]],
          outputs: [{ id: "f", type: "RES", tag: "BatchCount" }],
        },
      ],
    },
  },

  {
    key: "tank-level",
    name: "Tank level with high and low alarms",
    description:
      "Comparison instructions on an analog value. Drag the level slider and watch the alarms. The high alarm uses a latch so it does not chatter at the threshold.",
    program: {
      name: "Tank level with high and low alarms",
      scanMs: 100,
      tags: [
        { name: "Level", type: "INT", value: 50, isInput: true, comment: "Tank level, 0-100%" },
        { name: "High_Alarm", type: "BOOL", value: 0, isOutput: true },
        { name: "Low_Alarm", type: "BOOL", value: 0, isOutput: true },
        { name: "Pump", type: "BOOL", value: 0, isOutput: true },
      ],
      rungs: [
        {
          id: "r1",
          comment: "Above 80% sets the alarm.",
          branches: [[{ id: "a", type: "GRT", tag: "Level", operand: "80" }]],
          outputs: [{ id: "b", type: "OTL", tag: "High_Alarm" }],
        },
        {
          id: "r2",
          comment: "It only clears below 75%, that gap is the hysteresis that stops chatter.",
          branches: [[{ id: "c", type: "LES", tag: "Level", operand: "75" }]],
          outputs: [{ id: "d", type: "OTU", tag: "High_Alarm" }],
        },
        {
          id: "r3",
          comment: "Low alarm below 15%.",
          branches: [[{ id: "e", type: "LES", tag: "Level", operand: "15" }]],
          outputs: [{ id: "f", type: "OTE", tag: "Low_Alarm" }],
        },
        {
          id: "r4",
          comment: "Pump runs on low alarm, and stops once the high alarm trips.",
          branches: [
            [
              { id: "g", type: "XIC", tag: "Low_Alarm" },
              { id: "h", type: "XIO", tag: "High_Alarm" },
            ],
          ],
          outputs: [{ id: "i", type: "OTE", tag: "Pump" }],
        },
      ],
    },
  },
];

export const STARTER_BY_KEY = new Map(STARTER_PROGRAMS.map((s) => [s.key, s]));

/**
 * A blank project.
 *
 * The CRM used to mint this server-side, which meant Studio could not open a
 * new project without a backend agreeing to make one first. It belongs here:
 * "what an empty ladder program is" is a fact about the program model, not
 * about anybody's database.
 *
 * One empty rung rather than none, because a canvas with nowhere to put a
 * contact reads as broken, and the first thing anyone does is add one.
 */
export function emptyProgram(name = "Untitled"): LadxProgram {
  return {
    name,
    scanMs: 100,
    tags: [],
    rungs: [{ id: nid("rung"), branches: [[]], outputs: [] }],
  };
}
