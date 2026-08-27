import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-none px-2.5 py-1 font-display text-[13px] font-normal uppercase leading-none tracking-[0.16em] transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "bg-secondary text-foreground",
        secondary: "bg-muted text-muted-foreground",
        destructive: "bg-destructive/15 text-destructive",
        outline: "border border-border text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
