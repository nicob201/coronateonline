import type { Metadata } from "next";
import { CaseStudy } from "@/features/about/components/case-study";

export const metadata: Metadata = {
  title: "Acerca - CoronaTeOnline",
  description: "Cómo está hecho CoronaTeOnline: arquitectura, decisiones, un bug de concurrencia y lo que se cambiaría.",
};

// Case study of the project: problem, architecture, decisions and what would change.
export default function AcercaPage() {
  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[1280px] pt-16 pb-32">
      <CaseStudy />
    </main>
  );
}
