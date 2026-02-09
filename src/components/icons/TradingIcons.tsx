import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

export const LogoIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-10 h-10", className)}
  >
    <rect width="40" height="40" rx="8" className="fill-primary" />
    <path
      d="M10 28L16 20L22 24L30 12"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-primary-foreground"
    />
    <circle cx="30" cy="12" r="3" className="fill-success" />
  </svg>
);

export const ChartUpIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-6 h-6", className)}
  >
    <path
      d="M3 17L9 11L13 15L21 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 7H21V11"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ChartDownIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-6 h-6", className)}
  >
    <path
      d="M3 7L9 13L13 9L21 17"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 17H21V13"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const CandlestickIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-6 h-6", className)}
  >
    <rect x="4" y="8" width="4" height="8" rx="1" fill="currentColor" className="fill-success" />
    <line x1="6" y1="6" x2="6" y2="8" stroke="currentColor" strokeWidth="1.5" className="stroke-success" />
    <line x1="6" y1="16" x2="6" y2="18" stroke="currentColor" strokeWidth="1.5" className="stroke-success" />
    
    <rect x="10" y="10" width="4" height="6" rx="1" fill="currentColor" className="fill-destructive" />
    <line x1="12" y1="7" x2="12" y2="10" stroke="currentColor" strokeWidth="1.5" className="stroke-destructive" />
    <line x1="12" y1="16" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" className="stroke-destructive" />
    
    <rect x="16" y="6" width="4" height="10" rx="1" fill="currentColor" className="fill-success" />
    <line x1="18" y1="4" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" className="stroke-success" />
    <line x1="18" y1="16" x2="18" y2="20" stroke="currentColor" strokeWidth="1.5" className="stroke-success" />
  </svg>
);
