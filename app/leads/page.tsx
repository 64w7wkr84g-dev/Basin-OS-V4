import { getAllActiveLeads } from "@/lib/data";
import { LeadVerificationBoard } from "@/components/LeadVerificationBoard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LeadsPage({
  searchParams
}: {
  searchParams?: Promise<{ bucket?: string }>;
}) {
  const params = await searchParams;
  const leads = await getAllActiveLeads();
  const bucket = params?.bucket;

  const filtered =
    bucket === "cpa"
      ? leads.filter((lead) => lead.isCPA || lead.cpaVerify || lead.type === "cpa")
      : leads;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{bucket === "cpa" ? "CPA Network Directory" : "Lead Verification Board"}</CardTitle>
          <CardDescription>
            Review Groq-scored leads, verify LinkedIn profiles, reject bad matches, or request additional NPI/source data.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <LeadVerificationBoard leads={filtered} />
      </CardContent>
    </Card>
  );
}
