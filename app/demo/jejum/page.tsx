import { FastingDemo } from "@/components/fasting-demo";
import { fastingConfig } from "@/lib/fasting-call";
import { allowedOutreachNumbers } from "@/lib/outreach-policy";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <FastingDemo live={Boolean(fastingConfig() && allowedOutreachNumbers())} />
  );
}
