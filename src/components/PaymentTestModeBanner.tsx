const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken?.startsWith("pk_test_")) return null;
  return (
    <div className="w-full border-b border-warning/40 bg-warning/15 px-4 py-2 text-center text-xs text-foreground/80">
      Modo de prueba — usa la tarjeta <span className="font-mono">4242 4242 4242 4242</span> para
      probar pagos sin coste real.
    </div>
  );
}