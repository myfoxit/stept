import { Button } from "@/components/ui/button";
import { NodeViewWrapper } from "@tiptap/react";

export const HeroNodeComponent: React.FC = () => (
  <NodeViewWrapper className="react-component">
    <section className="py-16 text-center">
      <h1 className="mb-4 text-4xl font-bold tracking-tight">Hero headline</h1>
      <p className="mx-auto mb-6 max-w-2xl text-lg text-muted-foreground">
        A short sub‑heading to explain your value proposition.
      </p>
      <Button className="h-10 rounded-md shadow">Get started</Button>
    </section>
  </NodeViewWrapper>
);