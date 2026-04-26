import { createFileRoute } from "@tanstack/react-router";

import { Header } from "@/components/site/Header";
import { Hero } from "@/components/site/Hero";
import { Pipeline } from "@/components/site/Pipeline";
import { WhyThisWorks } from "@/components/site/WhyThisWorks";
import { PrDiff } from "@/components/site/PrDiff";
import { Faq } from "@/components/site/Faq";
import { FinalCta } from "@/components/site/FinalCta";
import { Footer } from "@/components/site/Footer";
import { ScanProvider } from "@/lib/scan-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "lovabletoseo · The AI marketer for Lovable founders" },
      {
        name: "description",
        content:
          "Your Lovable app is a React SPA. Google sees an empty <div id=\"root\">. ChatGPT has nothing to cite. We rebuild it as static HTML enhanced with Peec buyer-query data, in one PR.",
      },
      { property: "og:title", content: "lovabletoseo · The AI marketer for Lovable founders" },
      {
        property: "og:description",
        content: "Turn your Lovable React SPA into static HTML LLMs can cite. One PR, five stages, no black box.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ScanProvider>
      <div className="min-h-screen bg-paper text-ink">
        <Header />
        <main>
          <Hero />
          <Pipeline />
          <WhyThisWorks />
          <PrDiff />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </ScanProvider>
  );
}
