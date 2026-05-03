import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("w-full rounded-xl border border-basin-border bg-[#0d151f] px-3 py-2 text-sm text-basin-text outline-none placeholder:text-basin-muted2 focus:border-basin-gold focus:ring-2 focus:ring-basin-gold/20", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-36 w-full resize-y rounded-xl border border-basin-border bg-[#0d151f] px-3 py-2 text-sm text-basin-text outline-none placeholder:text-basin-muted2 focus:border-basin-gold focus:ring-2 focus:ring-basin-gold/20", className)} {...props} />;
}
