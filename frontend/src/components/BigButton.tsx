// Primary/secondary CTA button per docs/design/09-design-system.md's
// elderly-first button contract: min height 56px, bold >=20px label,
// full-width on mobile, plain-word verbs (never "Submit"/"Proceed").
//
// Primary = red fill + bold text (only ever paired with >=20px bold copy,
// per doc 09's AA note on white-on-red at body sizes). Secondary = white
// 2px outline on black. Both meet the >=48x48 tap target; focus-visible
// ring is applied globally (see styles/tailwind.css).

import type { ButtonHTMLAttributes } from "react";

export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

const BASE =
  "min-h-[56px] w-full px-6 text-xl font-bold uppercase tracking-tight " +
  "sm:w-auto disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT = {
  primary: "bg-mp-red text-mp-white hover:bg-mp-red-press",
  secondary:
    "border-2 border-mp-white bg-transparent text-mp-white hover:bg-mp-surface",
};

export function BigButton({
  variant = "primary",
  className,
  children,
  ...rest
}: BigButtonProps) {
  const classes = [BASE, VARIANT[variant], className].filter(Boolean).join(" ");
  return (
    <button {...rest} className={classes}>
      {children}
    </button>
  );
}
