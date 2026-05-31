import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { fetchLlmSettings, saveLlmSettings } from "@/lib/supabase-api";
import type { LlmSettings } from "@/types/hospital";

const defaultLlmSettings: LlmSettings = {
  provider: "lovable_gateway",
  model: "google/gemini-3-flash-preview",
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM API Settings</CardTitle>
        <CardDescription>
          Configure which model provider the Chat Assistant uses.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="llm-provider">Provider</Label>
          <Select
            value={draft.provider}
            onValueChange={(value: LlmSettings["provider"]) => setDraft((prev) => ({ ...prev, provider: value }))}
            disabled={!isAdmin || saveMutation.isPending}
          >
            <SelectTrigger id="llm-provider">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lovable_gateway">Lovable AI Gateway (default)</SelectItem>
              <SelectItem value="gemini_direct">Google Gemini API (your own key)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="llm-model">Model</Label>
          <Input
            id="llm-model"
            value={draft.model}
            placeholder={draft.provider === "gemini_direct" ? "gemini-1.5-flash" : "google/gemini-3-flash-preview"}
            onChange={(event) => setDraft((prev) => ({ ...prev, model: event.target.value }))}
            disabled={!isAdmin || saveMutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            {draft.provider === "gemini_direct"
              ? "Add your GEMINI_API_KEY in project Secrets so the edge function can call your own Google Gemini account."
              : "This uses LOVABLE_API_KEY from your project secrets."}
          </p>
        </div>

        <Button
          type="button"
          onClick={() => saveMutation.mutate(draft)}
          disabled={!isAdmin || saveMutation.isPending || !draft.model.trim()}
        >
          {saveMutation.isPending ? "Saving..." : "Save LLM Settings"}
        </Button>
      </CardContent>
    </Card>
  );
};
