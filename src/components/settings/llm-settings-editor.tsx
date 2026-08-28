import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchLlmSettings, saveLlmSettings, testGeminiConnection, type GeminiConnectionStatus } from "@/lib/supabase-api";
import type { LlmSettings } from "@/types/hospital";
import { CheckCircle2, CircleAlert, Loader2, PlugZap } from "lucide-react";

const defaultLlmSettings: LlmSettings = {
  provider: "gemini_direct",
  model: "gemini-2.5-flash",
};

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
    mutationFn: testGeminiConnection,
    onSuccess: (result) => {
      setConnection(result);
      toast({
        title: result.status === "connected" ? "Gemini connected" : "Gemini needs attention",
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
          The Chat Assistant uses your securely stored Google Gemini API key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">Provider</p>
            <p className="text-xs text-muted-foreground">Google Gemini API</p>
          </div>
          <Badge variant="secondary">Gemini only</Badge>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-model">Model</Label>
          <Input
            id="llm-model"
            value={draft.model}
            placeholder="gemini-2.5-flash"
            onChange={(event) => setDraft((prev) => ({ ...prev, provider: "gemini_direct", model: event.target.value }))}
            disabled={!isAdmin || saveMutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            Add or replace GEMINI_API_KEY only in your secure server-side secrets. It is never displayed, sent to the browser, or stored in these settings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => saveMutation.mutate({ ...draft, provider: "gemini_direct" })}
            disabled={!isAdmin || saveMutation.isPending || !draft.model.trim()}
          >
            {saveMutation.isPending ? "Saving..." : "Save Gemini Settings"}
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
