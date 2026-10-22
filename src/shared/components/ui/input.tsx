import * as React from "react";
import { cn } from "@/shared/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-background px-3 py-[10px] text-foreground outline-none focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-3 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
