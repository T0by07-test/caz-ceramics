import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Banknote, CreditCard, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "bizum">("card");
  const [cashLoading, setCashLoading] = useState(false);
  const [cashConfirmOpen, setCashConfirmOpen] = useState(false);

  const startStripe = useCallback((plan: Plan, method: "card" | "bizum") => {
    setActivePlan(plan);
    setPaymentMethod(method);
    setMethodOpen(false);
    setOpen(true);
  }, []);

  const handleCash = useCallback(async (plan: Plan) => {
    setCashLoading(true);
    const { error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("purchase_plan_cash", {
      p_plan_id: plan.id,
    });
    setCashLoading(false);
    if (error) {
      toast.error(error.message ?? "No se pudo reservar tu plaza");
      return;
    }
    setMethodOpen(false);
    setCashConfirmOpen(true);
  }, []);

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
    const { clientSecret } = await createPlanCheckout({
      planId: activePlan.id,
      returnUrl,
      paymentMethod,
    });
    return clientSecret;
  }, [activePlan, paymentMethod]);

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
                <div className="min-w-0">
                  <h2 className="text-h3">{p.name}</h2>
                  <p className="text-label mt-1 uppercase">{p.classes_per_month} clases / mes</p>
                </div>
                <Badge variant="secondary" className="shrink-0">Pago único</Badge>
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
                  setMethodOpen(true);
                }}
              >
                Comprar plan
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={methodOpen}
        onOpenChange={(o) => {
          setMethodOpen(o);
          if (!o && !open && !cashConfirmOpen) setActivePlan(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>¿Cómo quieres pagar?</DialogTitle>
            <DialogDescription>
              {activePlan ? `Plan ${activePlan.name}` : "Elige tu método de pago"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Button
              variant="outline"
              size="lg"
              className="h-auto justify-start gap-3 py-4 text-left"
              disabled={cashLoading}
              onClick={() => activePlan && void handleCash(activePlan)}
            >
              <Banknote className="h-5 w-5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">Efectivo</span>
                <span className="text-sm text-muted-foreground">
                  Reserva tu plaza y paga en tu primera clase
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-auto justify-start gap-3 py-4 text-left"
              disabled={cashLoading}
              onClick={() => activePlan && startStripe(activePlan, "card")}
            >
              <CreditCard className="h-5 w-5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">Tarjeta</span>
                <span className="text-sm text-muted-foreground">Paga ahora con tarjeta</span>
              </span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-auto justify-start gap-3 py-4 text-left"
              disabled={cashLoading}
              onClick={() => activePlan && startStripe(activePlan, "bizum")}
            >
              <Smartphone className="h-5 w-5 shrink-0" />
              <span className="flex flex-col">
                <span className="font-medium">Bizum</span>
                <span className="text-sm text-muted-foreground">Paga ahora con Bizum</span>
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cashConfirmOpen}
        onOpenChange={(o) => {
          setCashConfirmOpen(o);
          if (!o) setActivePlan(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tu plaza está reservada</DialogTitle>
            <DialogDescription>
              Paga el importe en tu primera clase del mes.
            </DialogDescription>
          </DialogHeader>
          <Button
            size="lg"
            onClick={() => {
              setCashConfirmOpen(false);
              setActivePlan(null);
              void navigate({ to: "/app" });
            }}
          >
            Ir al calendario
          </Button>
        </DialogContent>
      </Dialog>

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