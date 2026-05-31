import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LlmSettingsEditor } from "@/components/settings/llm-settings-editor";

const SettingsPage = () => {
  return (
    <section className="space-y-5 sm:space-y-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Use the items in this menu to manage advanced app configuration.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Configuration moved</CardTitle>
          <CardDescription>KPI Benchmark has been relocated to the bottom of KPI Builder.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>

      <LlmSettingsEditor />
    </section>
  );
};

export default SettingsPage;