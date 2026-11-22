import { FastingDemo } from "@/components/fasting-demo";
import { fastingConfig } from "@/lib/fasting-call";
import {
  allowedOutreachNumbers,
  visitorDialingEnabled,
} from "@/lib/outreach-policy";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <FastingDemo
      mode={
        visitorDialingEnabled() || allowedOutreachNumbers()
          ? fastingConfig()
            ? "automatic"
            : "bridge"
          : "rehearsal"
      }
    />
  );
}
