// Primary/secondary CTA button per docs/design/09-design-system.md's
// elderly-first button contract: min height 56px, bold >=20px label,
// full-width on mobile, plain-word verbs (never "Submit"/"Proceed").
//
// TODO(impl): docs/design/09-design-system.md

import type { ButtonHTMLAttributes } from "react";

export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function BigButton({ variant = "primary", children, ...rest }: BigButtonProps) {
  return (
    <button
      {...rest}
      className={
        variant === "primary"
          ? "min-h-[56px] w-full bg-mp-red px-6 text-xl font-bold text-mp-white sm:w-auto"
          : "min-h-[56px] w-full border-2 border-mp-white px-6 text-xl font-bold text-mp-white sm:w-auto"
      }
    >
      {/* TODO(impl): docs/design/09-design-system.md */}
      {children}
    </button>
  );
}
