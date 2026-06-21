import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, MessageCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatLongDate, formatTimeRange, toIsoDate } from "@/lib/calendar";
import { copyToClipboard } from "@/lib/admin-tools";

export const Route = createFileRoute("/admin/mensajes")({
  head: () => ({ meta: [{ title: "Mensajes — Admin" }] }),
  component: AdminMessagesPage,
});

type UpcomingClass = { id: string; date: string; start_time: string; end_time: string };

type Snippet = { label: string; text: string };

const STATIC_SNIPPETS: Snippet[] = [
  { label: "Saludo", text: "¡Hola a todas! 👋" },
  { label: "Recordatorio", text: "Recordatorio: " },
  { label: "Enlace de reserva", text: "Reserva tu lugar aquí: " },
  { label: "Despedida", text: "¡Nos vemos en el taller! 🌿" },
];

function AdminMessagesPage() {
  const [text, setText] = useState("");
  const [classes, setClasses] = useState<UpcomingClass[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const today = toIsoDate(new Date());
      const { data } = await supabase
        .from("classes")
        .select("id, date, start_time, end_time")
        .eq("status", "scheduled")
        .gte("date", today)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(8);
      if (cancelled) return;
      setClasses((data ?? []) as UpcomingClass[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const insert = (snippet: string) => {
    setText((prev) => {
      if (!prev) return snippet;
      const needsSpace = !prev.endsWith(" ") && !prev.endsWith("\n");
      return prev + (needsSpace ? " " : "") + snippet;
    });
  };

  const classSnippet = (c: UpcomingClass) =>
    `${formatLongDate(c.date)}, ${formatTimeRange(c.start_time, c.end_time)}`;

  const handleCopy = async () => {
    if (!text.trim()) {
      toast.error("Escribe un mensaje antes de copiar.");
      return;
    }
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Mensaje copiado. Pégalo en tu grupo de WhatsApp.");
    else toast.error("No se pudo copiar el mensaje.");
  };

  const whatsappHref = useMemo(() => `https://wa.me/?text=${encodeURIComponent(text)}`, [text]);

  return (
    <div className="space-y-6">
      <div>
        <span className="text-label uppercase">Comunicación</span>
        <h1 className="text-h1 mt-1">Mensajes</h1>
        <p className="text-body mt-2 text-muted-foreground">
          Redacta un mensaje, cópialo y pégalo en tu grupo de WhatsApp. No se envía automáticamente.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-h3">Redactar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="message">Mensaje</Label>
              <Textarea
                id="message"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escribe aquí tu mensaje para el grupo…"
                rows={10}
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground">{text.length} caracteres</p>
            </div>

            <div className="space-y-2">
              <Label className="text-label uppercase">Insertar</Label>
              <div className="flex flex-wrap gap-2">
                {STATIC_SNIPPETS.map((s) => (
                  <Button
                    key={s.label}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => insert(s.text)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> {s.label}
                  </Button>
                ))}
              </div>
              {classes.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Próximas clases:</span>
                  <div className="flex flex-wrap gap-2">
                    {classes.map((c) => (
                      <Button
                        key={c.id}
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-auto whitespace-normal py-1 text-left text-xs capitalize"
                        onClick={() => insert(classSnippet(c))}
                      >
                        <Plus className="mr-1 h-3 w-3 shrink-0" /> {classSnippet(c)}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Button onClick={handleCopy} className="flex-1" disabled={!text.trim()}>
                <Copy className="mr-1 h-4 w-4" /> Copiar texto
              </Button>
              <Button asChild variant="secondary" className="flex-1" disabled={!text.trim()}>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!text.trim()}
                  onClick={(e) => {
                    if (!text.trim()) e.preventDefault();
                  }}
                >
                  <MessageCircle className="mr-1 h-4 w-4" /> Abrir WhatsApp
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-h3 flex items-center gap-2">
              Vista previa <Badge variant="outline">en vivo</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {text.trim() ? (
              <div className="rounded-2xl rounded-tl-sm bg-[#dcf8c6] p-4 text-sm text-[#111b21] shadow-sm">
                <p className="whitespace-pre-wrap break-words">{text}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                La vista previa de tu mensaje aparecerá aquí.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
