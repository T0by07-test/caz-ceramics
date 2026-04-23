import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { createPlanCheckout } from "@/lib/checkout";
import { StripeCheckoutDialog } from "@/components/StripeCheckoutDialog";

type Plan = {
  id: string;
  name: string;
  classes_per_month: number;
  price_cents: number;
  stripe_price_id: string;
};

export const Route = createFileRoute("/app/planes")({
  head: () => ({ meta: [{ title: "Planes — Cerámica Studio" }] }),
  component: PlanesPage,
});

function PlanesPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, name, classes_per_month, price_cents, stripe_price_id")
        .eq("active", true)
        .order("classes_per_month", { ascending: true });
      if (error) {
        toast.error("No se pudieron cargar los planes");
        setPlans([]);
        return;
      }
      setPlans((data ?? []) as Plan[]);
    })();
  }, []);

  const fetchClientSecret = useCallback(async () => {
    if (!activePlan) throw new Error("No plan selected");
    const returnUrl = `${window.location.origin}/app/plan-exitoso?session_id={CHECKOUT_SESSION_ID}`;
    const { clientSecret } = await createPlanCheckout({ planId: activePlan.id, returnUrl });
    return clientSecret;
  }, [activePlan]);

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Suscripciones</span>
        <h1 className="text-h1 mt-1">Planes mensuales</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Compra tu plan del mes. Los créditos se reinician cada mes y no se acumulan.
        </p>
      </div>

      {plans === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay planes disponibles ahora mismo.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((p) => (
            <Card key={p.id} className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-h3">{p.name}</h2>
                  <p className="text-label mt-1 uppercase">{p.classes_per_month} clases / mes</p>
                </div>
                <Badge variant="secondary">Pago único</Badge>
              </div>
              <p className="text-3xl font-semibold tabular-nums">
                {(p.price_cents / 100).toLocaleString("es-ES", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
                })}
              </p>
              <Button
                size="lg"
                onClick={() => {
                  setActivePlan(p);
                  setOpen(true);
                }}
              >
                Comprar plan
              </Button>
            </Card>
          ))}
        </div>
      )}

      <StripeCheckoutDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setActivePlan(null);
        }}
        title={activePlan ? `Comprar ${activePlan.name}` : "Comprar plan"}
        fetchClientSecret={fetchClientSecret}
      />
    </div>
  );
}