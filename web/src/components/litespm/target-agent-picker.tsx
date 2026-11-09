"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Searchable target-agent picker for the install command.
 *
 * A package page can offer up to 81 valid targets (52 MCP hosts for local MCP
 * rows, the remote-capable subset for URL rows, 79 skill targets for skills),
 * so a plain select no longer fits — this combobox filters as you type and
 * keeps the "target agent" control one click wide.
 */
export function TargetAgentPicker({
  targets,
  value,
  onChange,
  kindLabel,
}: {
  targets: Array<{ id: string; name: string }>;
  value: string;
  onChange: (id: string) => void;
  kindLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = targets.find((t) => t.id === value) ?? targets[0];

  if (targets.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-[210px] justify-between rounded-lg px-2.5 text-[12px] font-normal"
        >
          <span className="truncate">{selected ? selected.name : "Select agent"}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-52" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="end">
        <Command shouldFilter={true}>
          <CommandInput
            placeholder={`Search ${targets.length} ${kindLabel}…`}
            className="text-[12.5px]"
          />
          <CommandList className="max-h-[260px]">
            <CommandEmpty className="py-6 text-center text-[12px] text-muted-foreground">
              No agent matches.
            </CommandEmpty>
            <CommandGroup>
              {targets.map((target) => (
                <CommandItem
                  key={target.id}
                  value={`${target.name} ${target.id}`}
                  onSelect={() => {
                    onChange(target.id);
                    setOpen(false);
                  }}
                  className="text-[12.5px]"
                >
                  <Check
                    className={cn(
                      "mr-1.5 h-3.5 w-3.5",
                      value === target.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {target.name}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                    {target.id}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
