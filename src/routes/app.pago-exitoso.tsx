import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/pago-exitoso")({
  head: () => ({ meta: [{ title: "Pago confirmado — Cerámica Studio" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: PagoExitosoPage,
});

function PagoExitosoPage() {
  const { session_id } = Route.useSearch();
  const [status, setStatus] = useState<"waiting" | "confirmed" | "failed">("waiting");

  useEffect(() => {
    if (!session_id) {
      setStatus("failed");
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      const { data } = await supabase
        .from("payments")
        .select("status, booking_id")
        .eq("stripe_session_id", session_id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.status === "confirmed") setStatus("confirmed");
      else if (data?.status === "failed") setStatus("failed");
      else if (attempts++ < 15) setTimeout(poll, 1000);
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [session_id]);

  return (
    <div className="mx-auto max-w-md py-10">
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        {status === "confirmed" ? (
          <>
            <CheckCircle2 className="h-12 w-12 text-success" />
            <h1 className="text-h1">¡Reserva confirmada!</h1>
            <p className="text-body text-muted-foreground">
              Tu clase está lista. Te esperamos en el estudio.
            </p>
          </>
        ) : status === "failed" ? (
          <>
            <h1 className="text-h1">Algo no salió bien</h1>
            <p className="text-body text-muted-foreground">
              No hemos podido confirmar tu pago. Si el cargo se realizó, contáctanos.
            </p>
          </>
        ) : (
          <>
            <Clock className="h-12 w-12 animate-pulse text-primary" />
            <h1 className="text-h1">Confirmando tu pago…</h1>
            <p className="text-body text-muted-foreground">Esto suele tardar unos segundos.</p>
          </>
        )}
        <div className="flex gap-3 pt-2">
          <Button asChild variant="secondary">
            <Link to="/app">Ir al calendario</Link>
          </Button>
          <Button asChild>
            <Link to="/app/reservas">Mis reservas</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}