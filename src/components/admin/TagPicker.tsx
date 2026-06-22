import { useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type Tag = { id: string; name: string; color: string | null };

type Props = {
  allTags: Tag[];
  selectedIds: string[];
  onToggle: (tagId: string, next: boolean) => void;
  disabled?: boolean;
};

export function TagPicker({ allTags, selectedIds, onToggle, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = new Set(selectedIds);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {allTags.filter((t) => selected.has(t.id)).map((t) => (
          <Badge key={t.id} variant="outline">{t.name}</Badge>
        ))}
        {selectedIds.length === 0 ? <span className="text-sm text-muted-foreground">Sin tags</span> : null}
      </div>
      {disabled ? null : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">Editar tags</Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar tag…" />
              <CommandList>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup>
                  {allTags.map((t) => {
                    const on = selected.has(t.id);
                    return (
                      <CommandItem key={t.id} value={t.name} onSelect={() => onToggle(t.id, !on)}>
                        <Check className={["mr-2 h-4 w-4", on ? "opacity-100" : "opacity-0"].join(" ")} />
                        {t.name}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
