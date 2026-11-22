import type { Metadata } from "next";
import { DemoExperience } from "@/components/demo-experience";
import { allowedOutreachNumbers, visitorDialingEnabled } from "@/lib/outreach-policy";

export const metadata: Metadata = {
  title: "Experimente a Lia | CareCircle",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <DemoExperience
      realAvailable={visitorDialingEnabled() || allowedOutreachNumbers() !== null}
      textAvailable={Boolean(
        process.env.CARECIRCLE_EVOLUTION_TEXT_URL &&
        process.env.CARECIRCLE_EVOLUTION_API_KEY,
      )}
    />
  );
}
