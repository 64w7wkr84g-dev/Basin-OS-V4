import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "teal" | "danger" | "ghost" };

export function Button({ className, variant = "secondary", ...props }: ButtonProps) {
  const variants = {
    primary: "border-basin-gold bg-gradient-to-b from-basin-gold2 to-basin-gold text-black hover:brightness-110",
    secondary: "border-basin-border bg-[#222b3a] text-basin-text hover:bg-[#2b3749]",
    teal: "border-basin-teal bg-gradient-to-b from-[#35e2cf] to-[#19aaa0] text-[#04100f] hover:brightness-110",
    danger: "border-rose-700 bg-rose-950/60 text-rose-200 hover:bg-rose-900/70",
    ghost: "border-transparent bg-transparent text-basin-muted hover:bg-white/5 hover:text-basin-text"
  };
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50", variants[variant], className)} {...props} />;
}
