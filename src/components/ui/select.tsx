import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
}

export const Select = React.forwardRef<HTMLDivElement, SelectProps>(
  ({ value, onChange, options, placeholder, disabled, className, size = "default" }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((opt) => opt.value === value);

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          isOpen &&
          triggerRef.current &&
          !triggerRef.current.contains(event.target as Node) &&
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const handleSelect = (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
    };

    const sizeClasses = {
      sm: "h-8 text-xs px-2",
      default: "h-10 text-sm px-3",
      lg: "h-12 text-base px-4",
    };

    return (
      <div ref={ref} className={cn("relative", className)}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={cn(
            "w-full flex items-center justify-between rounded-md border border-input bg-background",
            "transition-colors outline-none",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            isOpen && "ring-2 ring-ring ring-offset-2",
            sizeClasses[size]
          )}
        >
          <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption ? selectedOption.label : placeholder || "Select..."}
          </span>
          <ChevronDown
            size={16}
            className={cn(
              "ml-2 shrink-0 text-muted-foreground transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            className={cn(
              "absolute top-full left-0 right-0 mt-1 w-full bg-popover border border-border rounded-md shadow-lg z-50",
              "overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
            )}
          >
            <div className="max-h-60 overflow-y-auto p-1">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => !option.disabled && handleSelect(option.value)}
                  disabled={option.disabled}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded-sm transition-colors flex items-center justify-between",
                    "hover:bg-accent hover:text-accent-foreground",
                    "disabled:pointer-events-none disabled:opacity-50",
                    value === option.value && "bg-accent text-accent-foreground font-medium",
                    size === "sm" && "text-xs",
                    size === "default" && "text-sm",
                    size === "lg" && "text-base"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {value === option.value && (
                    <Check size={16} className="ml-2 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
