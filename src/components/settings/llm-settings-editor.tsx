import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchLlmSettings, saveLlmSettings, testGeminiConnection, type GeminiConnectionStatus } from "@/lib/supabase-api";
import type { LlmSettings } from "@/types/hospital";
import { CheckCircle2, CircleAlert, Loader2, PlugZap } from "lucide-react";

const defaultLlmSettings: LlmSettings = {
  provider: "gemini_direct",
  model: "gemini-2.5-flash",
};
const ORCA_DEFAULT_MODEL = "meta-llama/llama-3.1-8b-instruct:free";

export const LlmSettingsEditor = () => {
  const { roles, user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = roles.includes("admin");

  const { data: llmSettings } = useQuery({
    queryKey: ["app_settings", "llm_settings"],
    queryFn: fetchLlmSettings,
  });

  const [draft, setDraft] = useState<LlmSettings>(defaultLlmSettings);
  const [connection, setConnection] = useState<GeminiConnectionStatus | null>(null);

  useEffect(() => {
    if (llmSettings) setDraft(llmSettings);
  }, [llmSettings]);

  const saveMutation = useMutation({
    mutationFn: (next: LlmSettings) => {
      if (!user?.id) throw new Error("You must be signed in to save settings.");
      return saveLlmSettings(roles, next, user.id);
    },
    onSuccess: async () => {
      toast({ title: "LLM settings saved" });
      await queryClient.invalidateQueries({ queryKey: ["app_settings", "llm_settings"] });
    },
    onError: (error) =>
      toast({
        title: "Save failed",
        description: (error as Error).message,
        variant: "destructive",
      }),
  });

  const connectionMutation = useMutation({
    mutationFn: async (): Promise<GeminiConnectionStatus> => {
      if (draft.provider === "gemini_direct") {
        return testGeminiConnection();
      }
      const response = await fetch("/api/orca/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: draft.model,
          max_tokens: 1,
          temperature: 0,
          messages: [{ role: "user", content: "Reply with OK." }],
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } | string };
        const message = typeof payload.error === "string" ? payload.error : payload.error?.message;
        throw new Error(message || "Unable to reach OrcaRouter.");
      }
      return { configured: true, status: "connected", message: "OrcaRouter is connected and ready." };
    },
    onSuccess: (result) => {
      setConnection(result);
      toast({
        title: result.status === "connected" ? "Provider connected" : "Provider needs attention",
        description: result.message,
        variant: result.status === "connected" ? "default" : "destructive",
      });
    },
    onError: (error) => {
      const message = (error as Error).message;
      setConnection({ configured: false, status: "unavailable", message });
      toast({ title: "Connection check failed", description: message, variant: "destructive" });
    },
  });

  const isConnected = connection?.status === "connected";

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM API Settings</CardTitle>
        <CardDescription>
          Select the default Chat Assistant provider and model. Credentials always remain server-side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Provider</p>
            <p className="text-xs text-muted-foreground">Choose the default Chat Assistant provider</p>
          </div>
          <Badge variant="secondary">{draft.provider === "orca_router" ? "OrcaRouter" : "Google Gemini"}</Badge>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-provider">Default provider</Label>
          <Select
            value={draft.provider}
            onValueChange={(provider: LlmSettings["provider"]) => setDraft({
              provider,
              model: provider === "orca_router" ? ORCA_DEFAULT_MODEL : "gemini-2.5-flash",
            })}
            disabled={!isAdmin || saveMutation.isPending}
          >
            <SelectTrigger id="llm-provider"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini_direct">Google Gemini</SelectItem>
              <SelectItem value="orca_router">OrcaRouter</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-model">Model</Label>
          <Input
            id="llm-model"
            value={draft.model}
            placeholder={draft.provider === "orca_router" ? ORCA_DEFAULT_MODEL : "gemini-2.5-flash"}
            onChange={(event) => setDraft((prev) => ({ ...prev, model: event.target.value }))}
            disabled={!isAdmin || saveMutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            {draft.provider === "orca_router"
              ? "Set ORCA_ROUTER_API_KEY as a Cloudflare Worker secret. It is never displayed, sent to the browser, or stored here."
              : "Manage GEMINI_API_KEY only in secure server-side secrets. It is never displayed, sent to the browser, or stored here."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => saveMutation.mutate(draft)}
            disabled={!isAdmin || saveMutation.isPending || !draft.model.trim()}
          >
            {saveMutation.isPending ? "Saving..." : "Save AI Settings"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => connectionMutation.mutate()}
            disabled={!isAdmin || connectionMutation.isPending}
          >
            {connectionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
            Test connection
          </Button>
          {connection ? (
            <div className={isConnected ? "flex items-center gap-1.5 text-sm text-primary" : "flex items-center gap-1.5 text-sm text-destructive"}>
              {isConnected ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
              <span>{connection.message}</span>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
