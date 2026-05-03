import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent>
        <div className="font-mono text-3xl font-black text-basin-gold">{value}</div>
        <div className="mt-1 font-mono text-[10px] font-black uppercase tracking-[0.16em] text-basin-muted">
          {label}
        </div>
        {hint ? <div className="mt-1 text-xs text-basin-muted2">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
