import { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface TimeComboboxProps {
  value: string; // "HH:MM" 24h or ""
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  step?: number; // minute step for dropdown options (default 30)
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
}

const buildOptions = (step: number) => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += step) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(`${hh}:${mm}`);
  }
  return out;
};

const normalize = (raw: string): string => {
  const v = raw.trim();
  if (!v) return "";
  const m = v.match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!m) return "";
  const hh = Math.min(23, parseInt(m[1] || "0", 10));
  const mm = Math.min(59, parseInt(m[2] || "0", 10));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

export function TimeCombobox({
  value,
  onChange,
  disabled,
  placeholder = "HH:MM (24h)",
  step = 30,
  inputRef,
  className,
}: TimeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(value);
  }, [value]);

  const allOptions = useMemo(() => buildOptions(step), [step]);
  const filtered = useMemo(() => {
    const q = text.replace(/\s/g, "");
    if (!q) return allOptions;
    return allOptions.filter((o) => o.startsWith(q));
  }, [allOptions, text]);

  const commit = (raw: string) => {
    const norm = normalize(raw);
    setText(norm);
    onChange(norm);
  };

  const handleSelect = (opt: string) => {
    setText(opt);
    onChange(opt);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <div className={cn("relative", className)}>
        <Input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          maxLength={5}
          pattern="^([01][0-9]|2[0-3]):[0-5][0-9]$"
          placeholder={placeholder}
          aria-label="Time (24-hour format, 00:00 to 23:59)"
          disabled={disabled}
          value={text}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
            let formatted = digits;
            if (digits.length >= 3) {
              formatted = `${digits.slice(0, 2)}:${digits.slice(2)}`;
            }
            setText(formatted);
            // live-update parent so submission reflects partial typing too
            onChange(formatted);
            if (!open) setOpen(true);
          }}
          onBlur={(e) => {
            // delay so a click on a dropdown option fires first
            setTimeout(() => commit(e.target.value), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text);
              setOpen(false);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              const first = listRef.current?.querySelector<HTMLButtonElement>("button[data-time-option]");
              first?.focus();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="pr-9"
        />
        <PopoverTrigger asChild>
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Open time options"
          >
            <Clock className="h-4 w-4" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        align="end"
        className="w-[140px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          ref={listRef}
          className="max-h-60 overflow-y-auto py-1"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>
          ) : (
            filtered.map((opt) => {
              const selected = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  data-time-option
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleSelect(opt)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSelect(opt);
                    }
                  }}
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-sm tabular-nums hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
                    selected && "bg-accent text-accent-foreground font-medium",
                  )}
                >
                  {opt}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
