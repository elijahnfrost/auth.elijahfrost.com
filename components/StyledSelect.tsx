"use client";

import { forwardRef } from "react";
import type { CSSProperties, SelectHTMLAttributes } from "react";

// Native <select> styled to match the design-system text input (`ds-input`).
// The DS hasn't shipped its own Select yet, but its CSS already covers the
// border / radius / font / focus ring for `.ds-input`, so this just reuses
// that class on a <select> and re-adds a custom chevron (appearance:none
// suppresses the native one).
//
// Inline-SVG chevron (URL-encoded) so the color tracks --color-fg-muted in
// both light and dark themes without a separate asset file.
const chevron = (color: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='${color}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M1 1.5 6 6.5 11 1.5'/></svg>`,
  )}")`;

export interface StyledSelectOption<T extends string> {
  value: T;
  label?: string;
}

export type StyledSelectProps<T extends string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "value"
> & {
  options: ReadonlyArray<StyledSelectOption<T> | T>;
  value: T;
  onValueChange: (value: T) => void;
  invalid?: boolean;
  fullWidth?: boolean;
};

function StyledSelectInner<T extends string>(
  {
    options,
    value,
    onValueChange,
    invalid,
    fullWidth,
    className,
    style,
    disabled,
    ...rest
  }: StyledSelectProps<T>,
  ref: React.Ref<HTMLSelectElement>,
) {
  const cls = ["ds-input", className].filter(Boolean).join(" ");
  const composedStyle: CSSProperties = {
    backgroundImage: chevron("currentColor"),
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 0.75rem center",
    backgroundSize: "10px 7px",
    paddingRight: "2rem",
    color: "var(--color-fg)",
    cursor: disabled ? "not-allowed" : "pointer",
    width: fullWidth ? "100%" : undefined,
    ...style,
  };
  return (
    <select
      ref={ref}
      className={cls}
      style={composedStyle}
      value={value}
      onChange={(e) => onValueChange(e.target.value as T)}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      {...rest}
    >
      {options.map((opt) => {
        const o = typeof opt === "string" ? { value: opt as T, label: opt } : opt;
        return (
          <option key={o.value} value={o.value}>
            {o.label ?? o.value}
          </option>
        );
      })}
    </select>
  );
}

// forwardRef + generics requires this cast.
export const StyledSelect = forwardRef(StyledSelectInner) as <T extends string>(
  props: StyledSelectProps<T> & { ref?: React.Ref<HTMLSelectElement> },
) => ReturnType<typeof StyledSelectInner>;
