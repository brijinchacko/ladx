"use client";

import { Bot, User } from "lucide-react";
import { cn } from "../../lib/cn";

export interface ChatMessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  pending?: boolean;
}

export function ChatMessage({ role, content, pending }: ChatMessageProps) {
  if (role === "system") return null;
  const isUser = role === "user";
  const Icon = isUser ? User : Bot;

  return (
    <div className={cn("flex gap-3 px-4 py-3", isUser ? "bg-white" : "bg-ink-50")}>
      <div
        className={cn(
          "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
          isUser ? "bg-ink-100 text-ink-900" : "bg-teal text-white",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-500 mb-1">{isUser ? "You" : "ladX"}</p>
        <div
          className={cn(
            "prose prose-sm max-w-none whitespace-pre-wrap text-ink-900",
            pending && "text-ink-500",
          )}
        >
          {content}
          {pending && (
            <span className="inline-block w-2 h-4 bg-ink-400 animate-pulse ml-1 align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}
