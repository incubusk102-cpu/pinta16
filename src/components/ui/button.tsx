import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const brandButtonSurface =
  "bg-[color-mix(in_oklab,var(--logo-color)_88%,var(--foreground))] text-background border-[color-mix(in_oklab,var(--logo-color)_72%,var(--foreground))] shadow-[0_10px_28px_-14px_color-mix(in_oklab,var(--logo-color)_70%,transparent)] hover:bg-[color-mix(in_oklab,var(--logo-color)_78%,var(--foreground))] hover:border-[color-mix(in_oklab,var(--logo-color)_84%,var(--foreground))] hover:shadow-[0_14px_34px_-12px_color-mix(in_oklab,var(--logo-color)_75%,transparent)]";

const buttonVariants = cva(
  "ripple-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--logo-color)_70%,var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] active:shadow-sm [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: brandButtonSurface,
        destructive:
          "border-destructive bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 hover:shadow-lg",
        success: brandButtonSurface,
        warning:
          "border-[color-mix(in_oklab,var(--logo-color)_45%,var(--border))] bg-[color-mix(in_oklab,var(--logo-color)_12%,var(--background))] text-foreground shadow-sm hover:bg-[color-mix(in_oklab,var(--logo-color)_20%,var(--background))] hover:border-[color-mix(in_oklab,var(--logo-color)_60%,var(--border))] hover:shadow-md",
        dangerSoft:
          "border-destructive/35 bg-background text-destructive shadow-sm hover:bg-destructive hover:text-destructive-foreground hover:shadow-md",
        outline:
          "border-[color-mix(in_oklab,var(--logo-color)_35%,var(--border))] bg-background text-foreground shadow-sm hover:bg-[color-mix(in_oklab,var(--logo-color)_12%,var(--background))] hover:border-[color-mix(in_oklab,var(--logo-color)_60%,var(--border))] hover:shadow-md",
        secondary:
          "border-[color-mix(in_oklab,var(--logo-color)_30%,var(--border))] bg-secondary text-secondary-foreground shadow-sm hover:bg-[color-mix(in_oklab,var(--logo-color)_16%,var(--secondary))] hover:text-foreground hover:shadow-md",
        ghost:
          "border-transparent hover:bg-[color-mix(in_oklab,var(--logo-color)_12%,transparent)] hover:text-foreground active:bg-[color-mix(in_oklab,var(--logo-color)_18%,transparent)]",
        link: "border-transparent text-foreground underline-offset-4 hover:text-[var(--logo-color)] hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
