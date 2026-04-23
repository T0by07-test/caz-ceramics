import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <p className="text-h3 text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}