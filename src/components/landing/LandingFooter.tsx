import { Link } from "react-router-dom";
import { BrandedLogo } from "./BrandedLogo";
import { useBrand } from "@/contexts/BrandContext";
import { Mail, Phone, Facebook, Twitter, Instagram, MessageCircle } from "lucide-react";
import { buildSocialUrl } from "@/lib/social";
export const LandingFooter = () => {
  const {
    settings,
    isLoading
  } = useBrand();

  // Wait for settings to load to prevent flash of default values
  if (isLoading || !settings) {
    return <footer className="py-16 lg:py-20 px-4 border-t border-border/30 bg-secondary/10">
        <div className="container mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-10 w-40 bg-muted rounded" />
            <div className="h-4 w-64 bg-muted rounded" />
          </div>
        </div>
      </footer>;
  }
  const brandName = settings.brand_name;
  const copyrightName = settings.copyright_name || brandName;
  const supportEmail = settings.support_email;
  const supportPhone = settings.support_phone;
  const disclaimerText = settings.disclaimer_text || "Trading involves substantial risk and is not suitable for every investor. Past performance is not indicative of future results.";
  const socialLinks = [{
    url: buildSocialUrl(settings.social_facebook, "facebook"),
    icon: Facebook,
    label: "Facebook"
  }, {
    url: buildSocialUrl(settings.social_twitter, "twitter"),
    icon: Twitter,
    label: "Twitter"
  }, {
    url: buildSocialUrl(settings.social_instagram, "instagram"),
    icon: Instagram,
    label: "Instagram"
  }, {
    url: buildSocialUrl(settings.social_telegram, "telegram"),
    icon: MessageCircle,
    label: "Telegram"
  }].filter(link => !!link.url);
  return <>
      

      {/* Compliance Disclaimer */}
      {disclaimerText && <div className="py-5 px-4 bg-muted/30 border-t border-border/30">
          <div className="container mx-auto">
            <p className="text-xs text-muted-foreground text-center max-w-4xl mx-auto leading-relaxed">
              <strong className="text-foreground/70">Risk Disclaimer:</strong> {disclaimerText}
            </p>
          </div>
        </div>}
    </>;
};