import { useBrand } from "@/contexts/BrandContext";
import { LogoIcon } from "@/components/icons/TradingIcons";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useEffect } from "react";
interface BrandedLogoProps {
  className?: string;
  showName?: boolean;
  nameClassName?: string;
}
export const BrandedLogo = ({
  className,
  showName = false,
  nameClassName
}: BrandedLogoProps) => {
  const {
    settings
  } = useBrand();
  const {
    theme
  } = useTheme();
  const isDark = theme === 'dark';
  const brandName = settings?.brand_name || "nomeriq";
  // Use dark logo for dark theme, light logo for light theme
  const logoUrl = settings
    ? (isDark ? settings.logo_url_dark || settings.logo_url : settings.logo_url)
    : null;

  useEffect(() => {
    if (!logoUrl) return;
    const preloadImage = new Image();
    preloadImage.src = logoUrl;
  }, [logoUrl]);

  return <div className="flex items-center gap-2">
      {logoUrl ? <img src={logoUrl} alt={brandName} loading="eager" decoding="async" className={cn("h-7 sm:h-8 md:h-9 lg:h-10 w-auto max-w-[120px] sm:max-w-[140px] md:max-w-[160px] lg:max-w-[180px] object-contain", className)} /> : <LogoIcon className={cn("h-7 sm:h-8 md:h-9 lg:h-10 w-auto", className)} />}
      {showName && <span className={cn("font-bold text-lg", nameClassName)}>
          {brandName}
        </span>}
    </div>;
};

