import { DiscountStats } from "@/hooks/useAdminDashboardStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Gift, Tag, DollarSign, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  discounts: DiscountStats;
  isLoading: boolean;
}

export const DiscountAnalytics = ({ discounts, isLoading }: Props) => {
  if (isLoading) {
    return (
      <Card className="glass-card shadow-none">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-[200px] bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" />
          Discount & Promotions Analytics
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-3 rounded-xl bg-primary/10 text-center">
            <Tag className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">Active Codes</p>
            <p className="text-xl font-bold font-mono">{discounts.activeDiscounts}</p>
          </div>
          <div className="p-3 rounded-xl bg-success/10 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-success" />
            <p className="text-xs text-muted-foreground">Total Uses</p>
            <p className="text-xl font-bold font-mono">{discounts.totalDiscountUses}</p>
          </div>
          <div className="p-3 rounded-xl bg-warning/10 text-center">
            <DollarSign className="w-5 h-5 mx-auto mb-1 text-warning" />
            <p className="text-xs text-muted-foreground">Revenue Impact</p>
            <p className="text-xl font-bold font-mono">-${discounts.revenueImpact.toFixed(0)}</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 text-center">
            <Gift className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <p className="text-xs text-muted-foreground">Avg Discount</p>
            <p className="text-xl font-bold font-mono">
              ${discounts.totalDiscountUses > 0 
                ? (discounts.revenueImpact / discounts.totalDiscountUses).toFixed(0) 
                : 0}
            </p>
          </div>
        </div>

        {/* Top Performing Discounts */}
        {discounts.topDiscounts.length > 0 ? (
          <div>
            <h4 className="text-sm font-medium mb-3">Top Performing Discounts</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-center">Uses</TableHead>
                  <TableHead className="text-right">Revenue Impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discounts.topDiscounts.map((discount, index) => (
                  <TableRow key={discount.code}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {discount.code}
                        </Badge>
                        {index === 0 && (
                          <Badge className="bg-success/20 text-success text-xs">
                            Top
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      {discount.uses}
                    </TableCell>
                    <TableCell className="text-right font-mono text-warning">
                      -${discount.impact.toFixed(0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Gift className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No discount usage data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
