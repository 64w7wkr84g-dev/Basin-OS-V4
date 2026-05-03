import Link from "next/link";
import { BarChart3, BriefcaseBusiness, Gauge, Settings, ShieldCheck, UsersRound } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

const nav = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/leads", label: "Lead Verification", icon: UsersRound },
  { href: "/leads?bucket=cpa", label: "CPA Network Directory", icon: BriefcaseBusiness },
  { href: "/settings", label: "System Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-basin-black text-basin-text">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_80%_12%,rgba(217,154,43,.13),transparent_28%),radial-gradient(circle_at_78%_55%,rgba(69,211,111,.08),transparent_30%),linear-gradient(135deg,#030607,#07100f_60%,#020302)]" />
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="border-r border-basin-gold/20 bg-[#070c11]/95 p-4 lg:sticky lg:top-0 lg:h-screen">
          <div className="rounded-3xl border border-basin-gold/30 bg-gradient-to-br from-basin-panel to-[#080d13] p-5 shadow-terminal">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-basin-text to-slate-300 text-3xl font-black text-[#711a25]">
                B
              </div>
              <div>
                <div className="text-2xl font-black tracking-[0.18em]">BASIN</div>
                <div className="text-[10px] font-black tracking-[0.46em] text-basin-gold">VENTURES</div>
              </div>
            </div>
            <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-basin-muted">
              Secure V4 Lead OS
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            <div className="px-2 font-mono text-[11px] uppercase tracking-[0.24em] text-basin-muted2">Terminal</div>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-sm font-extrabold text-basin-text transition hover:border-basin-gold/30 hover:bg-white/[0.045]"
              >
                <item.icon className="h-4 w-4 text-basin-gold" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-8 rounded-2xl border border-rose-400/40 bg-rose-950/20 p-4 text-xs leading-5 text-rose-100">
            <div className="mb-1 flex items-center gap-2 font-black uppercase tracking-[0.16em] text-rose-200">
              <ShieldCheck className="h-4 w-4" />
              Compliance
            </div>
            Educational only. No guaranteed returns. No tax advice. No assumed accredited status. Manual review before outreach.
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-[#0c141d] p-3 text-center font-mono text-xs text-basin-muted">
            Basin OS V4
          </div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-30 grid gap-4 border-b border-basin-gold/20 bg-basin-black/85 px-6 py-5 backdrop-blur-xl xl:grid-cols-[1fr_auto]">
            <div>
              <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-basin-gold">
                Basin Ventures Command Center
              </div>
              <h1 className="mt-1 text-3xl font-black tracking-tight">Basin OS V4</h1>
              <p className="mt-1 max-w-4xl text-sm text-basin-muted">
                Secure Next.js CRM for Groq-parsed leads, human verification, CPA referral routes, and compliant outreach.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-white/10 bg-basin-panel px-4 py-2 text-right">
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-basin-muted">Operator</div>
                <div className="font-black">James</div>
              </div>
              <ThemeToggle />
            </div>
          </header>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
