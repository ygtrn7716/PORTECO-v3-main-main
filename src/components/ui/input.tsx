import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-neutral-dark placeholder:text-neutral-gray",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40"
        , className)}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
export { Input };
