import { Badge } from '@/components/ui/badge.tsx';

export interface LookUpColumnFieldProps<
  Row extends { id: string; name?: string }
> {
  value: Row | Row[] | null;
}

export function LookUpColumnField<Row extends { id: string; name?: string }>({
  value,
}: LookUpColumnFieldProps<Row>) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return <div />;
  }

  const renderBadge = (item: Row) => (
    <Badge key={item.id} variant="secondary" className="cursor-pointer">
      {item.name ?? item.id}
    </Badge>
  );

  return (
    <div className="flex flex-wrap gap-1">
      {Array.isArray(value) ? value.map(renderBadge) : renderBadge(value)}
    </div>
  );
}
