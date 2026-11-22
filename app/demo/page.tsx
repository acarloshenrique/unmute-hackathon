import type { Metadata } from "next";
import { DemoExperience } from "@/components/demo-experience";

export const metadata: Metadata = {
  title: "Experimente a Lia | CareCircle",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <DemoExperience
      textAvailable={Boolean(
        process.env.CARECIRCLE_EVOLUTION_TEXT_URL &&
        process.env.CARECIRCLE_EVOLUTION_API_KEY,
      )}
    />
  );
}
