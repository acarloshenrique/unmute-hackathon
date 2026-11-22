import type { Metadata } from "next";
import { ObsBoard } from "@/components/obs-board";

export const metadata: Metadata = {
  title: "Observabilidade da demo | CareCircle",
};

export const dynamic = "force-dynamic";

export default function Page() {
  return <ObsBoard />;
}
