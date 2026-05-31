import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { BedDouble, History, MessageSquarePlus, Send, Stethoscope, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatSaudiDateTime } from "@/lib/date-time";

type ChatThread = {
  id: string;
  title: string;
  updatedAt: string;
  messages: UIMessage[];
};

const STORAGE_KEY = "chat_assistant_threads_v1";
const FUNCTION_URL =
  "https://mlgwebfonhkywqhgniux.supabase.co/functions/v1/bed-chat";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sZ3dlYmZvbmhreXdxaGduaXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzA1MDcsImV4cCI6MjA5MTg0NjUwN30.yqWRCYUU8wulloZYhBBByjt4qPASW4h9cI2VkxGtxxM";

const SUGGESTED_PROMPTS = [
  { icon: BedDouble, text: "How many beds are vacant today across all departments?" },
  { icon: Stethoscope, text: "Which department has the highest occupancy right now?" },
  { icon: History, text: "Show today's occupied vs closed beds per department." },
  { icon: MessageSquarePlus, text: "What is the overall occupancy rate today?" },
];

const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

const loadThreads = (): ChatThread[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ChatThread[];
  } catch {
    return [];
  }
};

const saveThreads = (threads: ChatThread[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
};

const deriveTitle = (messages: UIMessage[]): string => {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const text = firstUser.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
  if (!text) return "New conversation";
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
};

const ChatAssistantInner = ({ threadId }: { threadId: string }) => {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads());
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeThread = threads.find((t) => t.id === threadId);
  const initialMessages = useMemo(() => activeThread?.messages ?? [], [threadId]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: FUNCTION_URL,
        fetch: async (url, init) => {
          const session = await supabase.auth.getSession();
          const token = session.data.session?.access_token ?? SUPABASE_ANON_KEY;
          const headers = new Headers(init?.headers);
          headers.set("Authorization", `Bearer ${token}`);
          headers.set("apikey", SUPABASE_ANON_KEY);
          return fetch(url, { ...init, headers });
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  // Persist messages whenever they change for this thread
  useEffect(() => {
    if (status === "streaming" || status === "submitted") return;
    setThreads((prev) => {
      const exists = prev.some((t) => t.id === threadId);
      const next: ChatThread = {
        id: threadId,
        title: deriveTitle(messages),
        updatedAt: new Date().toISOString(),
        messages,
      };
      const updated = exists
        ? prev.map((t) => (t.id === threadId ? next : t))
        : [next, ...prev];
      saveThreads(updated);
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status, threadId]);

  // Focus textarea on mount, thread change, and after stream completes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [threadId, status]);

  const isBusy = status === "submitted" || status === "streaming";

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
    void sendMessage({ text: trimmed });
    setInput("");
  };

  const handleNewThread = () => {
    const id = newId();
    const next: ChatThread = {
      id,
      title: "New conversation",
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    const updated = [next, ...threads];
    saveThreads(updated);
    setThreads(updated);
    navigate(`/chat-assistant/${id}`);
  };

  const handleSelectThread = (id: string) => {
    if (id === threadId) return;
    navigate(`/chat-assistant/${id}`);
  };

  const handleDeleteThread = (id: string) => {
    const remaining = threads.filter((t) => t.id !== id);
    saveThreads(remaining);
    setThreads(remaining);
    if (id === threadId) {
      if (remaining.length > 0) navigate(`/chat-assistant/${remaining[0].id}`);
      else {
        const newThreadId = newId();
        const fresh: ChatThread = {
          id: newThreadId,
          title: "New conversation",
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        saveThreads([fresh]);
        setThreads([fresh]);
        navigate(`/chat-assistant/${newThreadId}`);
      }
      setMessages([]);
    }
  };

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Threads sidebar */}
      <Card className="hidden h-full overflow-hidden lg:flex lg:flex-col">
        <div className="flex items-center justify-between border-b p-3">
          <p className="text-sm font-semibold">Conversations</p>
          <Button size="sm" variant="secondary" onClick={handleNewThread}>
            <MessageSquarePlus className="h-4 w-4" />
            New
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {threads.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No conversations yet.
              </p>
            ) : (
              threads.map((t) => {
                const active = t.id === threadId;
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors",
                      active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectThread(t.id)}
                      className="min-w-0 flex-1 truncate text-left"
                      title={t.title}
                    >
                      {t.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteThread(t.id)}
                      className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </Card>

      {/* Chat panel */}
      <Card className="flex h-full min-w-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">Chat Assistant</h1>
            <p className="truncate text-xs text-muted-foreground">
              Ask about occupied, vacant, or closed beds, room availability, occupancy rate, and the latest updates. Times shown are Saudi Arabia local time.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="lg:hidden"
            onClick={handleNewThread}
          >
            <MessageSquarePlus className="h-4 w-4" />
            New
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
            {messages.length === 0 ? (
              <EmptyState onPick={handleSend} />
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}

            {status === "submitted" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" />
                Thinking…
              </div>
            ) : null}

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                Couldn't reach the assistant. Please try again.
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <div className="border-t p-3">
          <div className="mx-auto w-full max-w-3xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="flex items-end gap-2"
            >
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(input);
                  }
                }}
                placeholder="Ask about beds, occupancy, closures…"
                className="min-h-[48px] max-h-40 flex-1 resize-none"
                disabled={isBusy}
                aria-label="Message"
              />
              {isBusy ? (
                <Button type="button" variant="secondary" onClick={() => stop()}>
                  Stop
                </Button>
              ) : (
                <Button type="submit" disabled={!input.trim()} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </form>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Bed management questions only · Latest record per date & department · Saudi Arabia time
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

const EmptyState = ({ onPick }: { onPick: (text: string) => void }) => (
  <div className="flex flex-col items-center gap-6 py-10 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
      <BedDouble className="h-7 w-7" />
    </div>
    <div className="space-y-1">
      <h2 className="text-xl font-semibold">How can I help with bed status?</h2>
      <p className="text-sm text-muted-foreground">
        Pick a quick prompt below or type your own bed management question.
      </p>
    </div>
    <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
      {SUGGESTED_PROMPTS.map((p) => (
        <button
          key={p.text}
          type="button"
          onClick={() => onPick(p.text)}
          className="flex items-start gap-3 rounded-lg border bg-card p-3 text-left text-sm transition hover:border-primary/40 hover:bg-accent"
        >
          <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{p.text}</span>
        </button>
      ))}
    </div>
  </div>
);

const MessageBubble = ({ message }: { message: UIMessage }) => {
  const isUser = message.role === "user";
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");

  return (
    <div className={cn("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BedDouble className="h-4 w-4" />
        </div>
      ) : null}
      <div className={cn("min-w-0 max-w-[85%]", isUser ? "" : "flex-1")}>
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
            <p className="whitespace-pre-wrap break-words">{text}</p>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none break-words text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-table:my-2 prose-th:px-2 prose-td:px-2 dark:prose-invert">
            {text ? (
              <ReactMarkdown>{text}</ReactMarkdown>
            ) : (
              <p className="text-sm text-muted-foreground">…</p>
            )}
          </div>
        )}
        <p
          className={cn(
            "mt-1 text-[10px] uppercase tracking-wide text-muted-foreground",
            isUser ? "text-right" : "text-left",
          )}
        >
          {formatSaudiDateTime(new Date(), { hour: "2-digit", minute: "2-digit", hour12: false })}
        </p>
      </div>
    </div>
  );
};

const ChatAssistantPage = () => {
  const navigate = useNavigate();
  const params = useParams();
  const routeId = params.threadId;

  // Bootstrap: ensure a thread exists and URL has a threadId
  useEffect(() => {
    if (routeId) return;
    const existing = loadThreads();
    if (existing.length > 0) {
      navigate(`/chat-assistant/${existing[0].id}`, { replace: true });
    } else {
      const id = newId();
      const fresh: ChatThread = {
        id,
        title: "New conversation",
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      saveThreads([fresh]);
      navigate(`/chat-assistant/${id}`, { replace: true });
    }
  }, [routeId, navigate]);

  if (!routeId) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      </div>
    );
  }

  return <ChatAssistantInner key={routeId} threadId={routeId} />;
};

export default ChatAssistantPage;