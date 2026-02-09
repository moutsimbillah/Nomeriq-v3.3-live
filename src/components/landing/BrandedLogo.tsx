import { useBrand } from "@/contexts/BrandContext";
import { LogoIcon } from "@/components/icons/TradingIcons";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
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
    settings,
    isLoading
  } = useBrand();
  const {
    theme
  } = useTheme();
  const isDark = theme === 'dark';

  // Show loading skeleton briefly, but don't block forever
  // If loading takes too long, BrandContext will use defaults
  if (isLoading && !settings) {
    return <div className="flex items-center gap-2">
        <div className={cn("h-8 w-auto bg-muted animate-pulse rounded", className)} style={{
        minWidth: '80px'
      }} />
      </div>;
  }

  // If still no settings after loading completes, use fallback
  if (!settings) {
    return <div className="flex items-center gap-2">
        <LogoIcon className={cn("h-8 w-auto", className)} />
      </div>;
  }
  const brandName = settings.brand_name;
  // Use dark logo for dark theme, light logo for light theme
  const logoUrl = isDark ? settings.logo_url_dark || settings.logo_url : settings.logo_url;
  return <div className="flex items-center gap-2">
      {logoUrl ? <img src={logoUrl} alt={brandName} className={cn("h-7 sm:h-8 md:h-9 lg:h-10 w-auto max-w-[120px] sm:max-w-[140px] md:max-w-[160px] lg:max-w-[180px] object-contain", className)} /> : <LogoIcon className={cn("h-7 sm:h-8 md:h-9 lg:h-10 w-auto", className)} />}
      {showName && <span className={cn("font-bold text-lg", nameClassName)}>
          {brandName}
        </span>}
    </div>;
};