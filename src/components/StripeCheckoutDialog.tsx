import { useEffect, useMemo, useState } from "react";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStripe } from "@/lib/stripe";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Called the first time the dialog opens to fetch a clientSecret. */
  fetchClientSecret: () => Promise<string>;
};

export function StripeCheckoutDialog({ open, onOpenChange, title, fetchClientSecret }: Props) {
  // Cache the clientSecret for as long as the dialog stays open. EmbeddedCheckoutProvider
  // throws "you cannot change the client secret after creation" if the function reference
  // changes between renders, so we resolve once per open and remount on close.
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSecret(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    fetchClientSecret()
      .then((s) => {
        if (!cancelled) setSecret(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchClientSecret]);

  const options = useMemo(
    () => (secret ? { fetchClientSecret: () => Promise.resolve(secret) } : null),
    [secret],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div id="checkout" className="min-h-[400px]">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !options ? (
            <p className="text-sm text-muted-foreground">Cargando pago seguro…</p>
          ) : (
            <EmbeddedCheckoutProvider stripe={getStripe()} options={options}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}