import { getRadarData } from "@/lib/data";
import { BasinOSApp } from "@/components/BasinOSApp";

export const dynamic = "force-dynamic";

export default async function Page() {
  const radar = await getRadarData();
  return <BasinOSApp radarData={radar} initialPage="api-command-center" />;
}
