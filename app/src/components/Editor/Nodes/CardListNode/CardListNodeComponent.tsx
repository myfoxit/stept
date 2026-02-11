import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NodeViewWrapper } from "@tiptap/react";

export const CardListNodeComponent: React.FC = () => (
  <NodeViewWrapper className="react-component">
    <div className="grid gap-4 md:grid-cols-2">
      {[1, 2].map((i) => (
        <Card key={i} className="shadow">
          <CardHeader>
            <CardTitle>{`Card title ${i}`}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Card content goes here
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  </NodeViewWrapper>
);