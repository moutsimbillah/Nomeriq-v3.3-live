import { cn } from "@/lib/utils";
interface ProfitLossBarProps {
  ratio: number; // 0-1, where 1 = all profit
}
export const ProfitLossBar = ({
  ratio
}: ProfitLossBarProps) => {
  // Clamp ratio between 0 and 1
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const lossPercent = (1 - clampedRatio) * 100;
  const profitPercent = clampedRatio * 100;
  return <div className="flex items-center gap-3 px-px">
      <span className="text-[10px] text-destructive font-medium">Loss</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-muted">
        {/* Loss portion (red) */}
        <div className="h-full bg-gradient-to-r from-destructive to-warning transition-all duration-500" style={{
        width: `${lossPercent}%`
      }} />
        {/* Profit portion (green) */}
        <div className="h-full bg-gradient-to-r from-warning to-success transition-all duration-500" style={{
        width: `${profitPercent}%`
      }} />
      </div>
      <span className="text-[10px] text-success font-medium">Profit</span>
    </div>;
};