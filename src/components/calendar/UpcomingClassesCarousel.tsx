import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, X } from "lucide-react";
import { useUpcomingClasses } from "@/hooks/useUpcomingClasses";
import { formatLongDate, formatTimeRange, teacherColorVar } from "@/lib/calendar";

export function UpcomingClassesCarousel() {
  const { slides, loading } = useUpcomingClasses(10);

  if (loading || slides.length === 0) return null;

  return (
    <Carousel opts={{ align: "start" }} className="w-full">
      <CarouselContent>
        {slides.map((slide) => (
          <CarouselItem key={slide.classId} className="basis-full sm:basis-1/2 lg:basis-1/3">
            <div
              className="h-full rounded-md border border-border bg-card p-4"
              style={{ borderTop: `3px solid ${teacherColorVar(slide.teacher)}` }}
            >
              <p className="text-h3 capitalize">{formatLongDate(slide.date)}</p>
              <p className="text-body flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {formatTimeRange(slide.startTime, slide.endTime)}
                {slide.teacher ? ` · ${slide.teacher}` : ""}
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {slide.students.length === 0 ? (
                  <li className="text-body text-muted-foreground">Sin reservas</li>
                ) : (
                  slide.students.map((s) => (
                    <li
                      key={s.bookingId}
                      className="flex items-center justify-between gap-2 text-body"
                    >
                      <span
                        className={
                          s.status === "cancelled" ? "text-muted-foreground line-through" : ""
                        }
                      >
                        {s.name}
                      </span>
                      {s.status === "cancelled" ? (
                        <Badge variant="outline" className="shrink-0">
                          <X className="mr-1 h-3 w-3" />
                          Cancelado
                        </Badge>
                      ) : s.status === "pending" ? (
                        <Badge variant="secondary" className="shrink-0">
                          Pago pendiente
                        </Badge>
                      ) : (
                        <Check className="h-4 w-4 shrink-0 text-success" />
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
