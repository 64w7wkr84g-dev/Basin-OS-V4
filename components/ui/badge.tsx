import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em]", className)} {...props} />;
}
