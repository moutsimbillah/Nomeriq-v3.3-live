import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { MarketsSection } from "@/components/landing/MarketsSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { SolutionsSection } from "@/components/landing/SolutionsSection";
import { AudienceSection } from "@/components/landing/AudienceSection";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/layout/Footer";
import { AuthModalProvider } from "@/contexts/AuthModalContext";
import { AuthModal } from "@/components/auth/AuthModal";

const Index = () => {
  return (
    <AuthModalProvider>
      <div className="min-h-screen bg-background">
        <LandingHeader />
        <div className="user-page-enter user-page-enter-delay-2">
          <HeroSection />
        </div>
        <div className="user-page-enter user-page-enter-delay-3">
          <MarketsSection />
        </div>
        <div className="user-page-enter user-page-enter-delay-4">
          <FeaturesSection />
        </div>
        <div className="user-page-enter user-page-enter-delay-5">
          <SolutionsSection />
        </div>
        <div className="user-page-enter user-page-enter-delay-5">
          <AudienceSection />
        </div>
        <div className="user-page-enter user-page-enter-delay-5">
          <CTASection />
        </div>
        <Footer />
        <AuthModal />
      </div>
    </AuthModalProvider>
  );
};

export default Index;
