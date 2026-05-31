import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hello World" },
      { name: "description", content: "A simple hello world project." },
      { property: "og:title", content: "Hello World" },
      { property: "og:description", content: "A simple hello world project." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground">Hello World</h1>
    </div>
  );
}
