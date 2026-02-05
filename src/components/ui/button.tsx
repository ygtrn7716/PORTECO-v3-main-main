import * as React from "react";
import { cn } from "../../lib/utils";
import { Slot } from "@radix-ui/react-slot";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  /** Butonu farklı elementler gibi render etmek için */
  as?: "button" | "a";
  href?: string; // as="a" için
  asChild?: boolean; // <Button asChild><Link/></Button> kullanabilmek için
}

export const Button = React.forwardRef<any, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      as = "button",
      asChild = false,
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center font-medium rounded-md transition-colors " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
      "focus-visible:ring-brand-blue disabled:opacity-50 disabled:pointer-events-none";

    const variants: Record<string, string> = {
      primary:
        "bg-brand-blue text-white hover:from-brand-blue hover:to-brand-blueLight hover:bg-gradient-to-r",
      secondary:
        "border border-brand-blue text-brand-blue hover:bg-neutral-lightBlue",
    };

    const sizes: Record<string, string> = {
      sm: "h-9 px-3 text-xs",
      md: "h-10 px-4 text-sm",
      lg: "h-11 px-6 text-base",
    };

    // Eğer asChild true ise Slot kullan, değilse normal buton/anchor
    const Comp: any = asChild ? Slot : as === "a" ? "a" : "button";

    return (
      <Comp
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
