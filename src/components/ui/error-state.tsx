import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = "Algo ha salido mal",
  message = "No hemos podido cargar la información. Inténtalo de nuevo.",
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="h-5 w-5" />
      </div>
      <p className="text-h3 text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}