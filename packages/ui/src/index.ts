export { Button, buttonVariants, type ButtonProps } from "./components/ui/button";
export { Input, type InputProps } from "./components/ui/input";
export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
export { Logo, type LogoProps } from "./components/brand/logo";
export {
  XMark,
  AppIcon,
  ICON_GROUND,
  ICON_MARK,
  X_GEOMETRY,
  type XMarkProps,
  type AppIconProps,
} from "./components/brand/x-mark";
export { ThinkingMark, type ThinkingMarkProps } from "./components/brand/thinking-mark";
export { ChatMessage, type ChatMessageProps } from "./components/chat/message";
export {
  Composer,
  type Attachment,
  type ComposerProps,
  type ModelOption,
  type ModelPicker,
} from "./components/chat/composer";
export {
  ChatWindow,
  type ChatTurn,
  type ChatWindowProps,
} from "./components/chat/chat-window";
export { Markdown } from "./components/chat/markdown";
export { Thinking, StreamCaret } from "./components/chat/thinking";
export { CodeBlock, type CodeBlockProps } from "./components/code/code-block";
export { cn } from "./lib/cn";

/* the assistant, shared by every tool */
export { default as Assistant } from "./components/assistant/assistant";
export type {
  AssistantProps,
  AssistantTurn,
  AssistantModels,
  AssistantModelOption,
  AssistantQuestion,
  AssistantAction,
  RunMode,
  RunModeControl,
} from "./components/assistant/assistant";
export { Steps, StepLog } from "./components/assistant/steps";
export { AiMark } from "./components/assistant/mark";
export type { AssistStep, StepState } from "./components/assistant/steps";
export { useAssistant } from "./lib/use-assistant";
export type { AssistRunContext, AssistResult, UseAssistantOptions } from "./lib/use-assistant";
export * from "./lib/assistant-frame";
export { ASSISTANT, RELAY_TITLES } from "./lib/assistant-brand";
export type { RelayTool } from "./lib/assistant-brand";

// The sidebar's appearance, shared so the web and the desktop cannot drift.
export * from "./lib/sidebar";

// How a tool reaches a model. Injected, never assumed.
export * from "./lib/ask-model";

// What the explaining assistants are told. Shared, so both surfaces answer alike.
export * from "./lib/assist-prompts";

// Where the assistant keeps what it remembers. Injected, so the desktop can
// put a conversation somewhere that survives a webview being cleared.
export * from "./lib/assistant-store";
