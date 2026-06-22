import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ES_WEEKDAYS_SHORT } from "@/lib/calendar";
import { formatSlot, type RecurringSlot } from "@/lib/members";

type Props = {
  slots: RecurringSlot[];
  onAdd: (weekday: number, startTime: string) => void;
  onRemove: (slotId: string) => void;
  disabled?: boolean;
};

export function SlotEditor({ slots, onAdd, onRemove, disabled }: Props) {
  const [weekday, setWeekday] = useState(0);
  const [time, setTime] = useState("18:30");
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {slots.length === 0 ? <li className="text-sm text-muted-foreground">Sin slot fijo</li> : null}
        {slots.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-sm">
            <span>{formatSlot(s.weekday, s.start_time)}</span>
            {disabled ? null : (
              <button type="button" aria-label="Quitar slot" onClick={() => onRemove(s.id)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {disabled ? null : (
        <div className="flex items-end gap-2">
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {ES_WEEKDAYS_SHORT.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          <input
            type="time"
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => onAdd(weekday, `${time}:00`)}>
            Añadir
          </Button>
        </div>
      )}
    </div>
  );
}
