import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricInfoTooltipProps {
  label: string;
  description: string;
}

export const MetricInfoTooltip = ({ label, description }: MetricInfoTooltipProps) => {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground/80 hover:text-muted-foreground transition-colors"
            aria-label={`${label} info`}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-xs leading-relaxed">
          {description}
        </TooltipContent>
      </Tooltip>
    </span>
  );
};
