/**
 * A motor circuit the generator actually wrote.
 *
 * Captured verbatim from /api/ladder/generate, not hand-tuned until it passed.
 * It is here because "the validator found nothing" says almost nothing: the two
 * mistakes caught while building this, a seal-in leg missing the stop
 * conditions and a contact on a timer rather than on its done bit, both pass
 * validation and both produce a machine that does the wrong thing.
 *
 * If the prompt that produces this is ever weakened, the behavioural tests
 * beside it fail rather than the output quietly getting worse.
 */
import type { LadxProgram } from "@ladx/studio";

export const GENERATED_MOTOR: LadxProgram = {
  name: "MotorControl",
  scanMs: 100,
  tags: [
    {
      name: "Start",
      type: "BOOL",
      value: 0,
      isInput: true,
      device: "PUSHBUTTON_NO",
      comment: "Momentary start button",
    },
    {
      name: "Stop",
      type: "BOOL",
      value: 1,
      isInput: true,
      device: "PUSHBUTTON_NC",
      comment: "Normally closed stop button",
    },
    {
      name: "EStop",
      type: "BOOL",
      value: 1,
      isInput: true,
      device: "PUSHBUTTON_NC",
      comment: "Normally closed emergency stop",
    },
    {
      name: "Motor",
      type: "BOOL",
      value: 0,
      isOutput: true,
      device: "MOTOR",
      comment: "Motor contactor",
    },
    {
      name: "Lamp",
      type: "BOOL",
      value: 0,
      isOutput: true,
      device: "LAMP",
      comment: "Indicator lamp",
    },
    {
      name: "T1",
      type: "TIMER",
      value: 0,
      preset: 5000,
      comment: "5 second delay timer for lamp",
    },
  ],
  rungs: [
    {
      id: "rmt77qlh30",
      comment: "Motor latch with seal-in and safety contacts",
      branches: [
        [
          {
            id: "emt77qlh31",
            type: "XIC",
            tag: "Start",
          },
          {
            id: "emt77qlh32",
            type: "XIC",
            tag: "Stop",
          },
          {
            id: "emt77qlh33",
            type: "XIC",
            tag: "EStop",
          },
        ],
        [
          {
            id: "emt77qlh34",
            type: "XIC",
            tag: "Motor",
          },
          {
            id: "emt77qlh35",
            type: "XIC",
            tag: "Stop",
          },
          {
            id: "emt77qlh36",
            type: "XIC",
            tag: "EStop",
          },
        ],
      ],
      outputs: [
        {
          id: "omt77qlh37",
          type: "OTE",
          tag: "Motor",
        },
      ],
    },
    {
      id: "rmt77qlh38",
      comment: "Start 5-second timer when motor starts",
      branches: [
        [
          {
            id: "emt77qlh39",
            type: "XIC",
            tag: "Motor",
          },
        ],
      ],
      outputs: [
        {
          id: "omt77qlh310",
          type: "TON",
          tag: "T1",
          preset: 5000,
        },
      ],
    },
    {
      id: "rmt77qlh311",
      comment: "Turn on lamp after 5-second delay",
      branches: [
        [
          {
            id: "emt77qlh312",
            type: "XIC",
            tag: "T1.DN",
          },
        ],
      ],
      outputs: [
        {
          id: "omt77qlh313",
          type: "OTE",
          tag: "Lamp",
        },
      ],
    },
  ],
} as LadxProgram;
