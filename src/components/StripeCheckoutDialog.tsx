import { useEffect, useMemo, useState } from "react";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getStripe } from "@/lib/stripe";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Called the first time the dialog opens to fetch a clientSecret. */
  fetchClientSecret: () => Promise<string>;
  /**
   * Fallback used when the app runs inside an iFrame (Lovable editor/preview),
   * where Stripe's embedded Checkout refuses to load. Returns a hosted
   * Checkout URL that we open at the top level / in a new tab.
   */
  fetchHostedUrl?: () => Promise<string>;
  /** Optional note shown above the payment form (e.g. Bizum phone number). */
  notice?: string;
};


function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function StripeCheckoutDialog({
  open,
  onOpenChange,
  title,
  fetchClientSecret,
  fetchHostedUrl,
}: Props) {
  // Cache the clientSecret for as long as the dialog stays open. EmbeddedCheckoutProvider
  // throws "you cannot change the client secret after creation" if the function reference
  // changes between renders, so we resolve once per open and remount on close.
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [framed, setFramed] = useState(false);

  useEffect(() => {
    setFramed(isInIframe());
  }, []);

  useEffect(() => {
    if (!open) {
      setSecret(null);
      setHostedUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setError(null);
    const useHosted = isInIframe() && Boolean(fetchHostedUrl);
    if (useHosted) {
      fetchHostedUrl!()
        .then((url) => {
          if (cancelled) return;
          setHostedUrl(url);
          window.open(url, "_blank", "noopener,noreferrer");
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Error");
        });
      return () => {
        cancelled = true;
      };
    }
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
  }, [open, fetchClientSecret, fetchHostedUrl]);

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
          ) : framed && fetchHostedUrl ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                El pago seguro se abre en una pestaña nueva. Si no se ha abierto, usa el botón.
              </p>
              <Button
                size="lg"
                className="w-full"
                disabled={!hostedUrl}
                onClick={() => {
                  if (hostedUrl) window.open(hostedUrl, "_blank", "noopener,noreferrer");
                }}
              >
                {hostedUrl ? "Abrir pago seguro" : "Preparando pago…"}
              </Button>
            </div>
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