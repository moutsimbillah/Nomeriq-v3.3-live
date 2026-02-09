import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { AdminAuditLog, Profile } from "@/types/database";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, UserMinus, RefreshCw, Shield, History } from "lucide-react";

const actionConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  add_admin: {
    label: "Added Admin",
    icon: UserPlus,
    color: "bg-success/10 text-success",
  },
  remove_admin: {
    label: "Removed Admin",
    icon: UserMinus,
    color: "bg-destructive/10 text-destructive",
  },
  change_role: {
    label: "Changed Role",
    icon: RefreshCw,
    color: "bg-warning/10 text-warning",
  },
  suspend_admin: {
    label: "Suspended Admin",
    icon: Shield,
    color: "bg-destructive/10 text-destructive",
  },
  activate_admin: {
    label: "Activated Admin",
    icon: Shield,
    color: "bg-success/10 text-success",
  },
};

interface LogWithProfiles extends AdminAuditLog {
  performer?: Profile;
  target?: Profile;
}

export const AdminAuditLogsPanel = () => {
  const [logs, setLogs] = useState<LogWithProfiles[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data: logsData, error } = await supabase
          .from('admin_audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        if (!logsData || logsData.length === 0) {
          setLogs([]);
          return;
        }

        // Get unique user IDs
        const userIds = new Set<string>();
        logsData.forEach(log => {
          userIds.add(log.performed_by);
          userIds.add(log.target_user_id);
        });

        // Fetch profiles for these users
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('user_id', Array.from(userIds));

        const profilesMap = new Map(
          (profiles || []).map(p => [p.user_id, p as Profile])
        );

        const logsWithProfiles: LogWithProfiles[] = logsData.map(log => ({
          ...log,
          old_value: log.old_value as Record<string, unknown> | null,
          new_value: log.new_value as Record<string, unknown> | null,
          performer: profilesMap.get(log.performed_by),
          target: profilesMap.get(log.target_user_id),
        }));

        setLogs(logsWithProfiles);
      } catch (err) {
        console.error('Error fetching audit logs:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-xl bg-card">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border rounded-xl bg-card">
        <History className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No audit logs yet</p>
        <p className="text-sm text-muted-foreground">Admin actions will be logged here</p>
      </div>
    );
  }

  return (
    <div className="border rounded-xl bg-card">
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <History className="w-5 h-5" />
          Recent Admin Actions
        </h3>
        <p className="text-sm text-muted-foreground">All admin role changes are logged for security</p>
      </div>
      <ScrollArea className="h-[400px]">
        <div className="p-4 space-y-3">
          {logs.map((log) => {
            const config = actionConfig[log.action] || {
              label: log.action,
              icon: Shield,
              color: "bg-muted text-muted-foreground",
            };
            const ActionIcon = config.icon;
            const performerName = log.performer
              ? `${log.performer.first_name || ''} ${log.performer.last_name || ''}`.trim() || log.performer.email
              : 'Unknown';
            const targetName = log.target
              ? `${log.target.first_name || ''} ${log.target.last_name || ''}`.trim() || log.target.email
              : 'Unknown';

            return (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className={`p-2 rounded-lg ${config.color}`}>
                  <ActionIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{performerName}</span>
                    {' '}
                    <span className="text-muted-foreground">{config.label.toLowerCase()}</span>
                    {' '}
                    <span className="font-medium">{targetName}</span>
                  </p>
                  {log.old_value || log.new_value ? (
                    <div className="flex items-center gap-2 mt-1">
                      {log.old_value?.admin_role && (
                        <Badge variant="outline" className="text-xs">
                          {String(log.old_value.admin_role).replace(/_/g, ' ')}
                        </Badge>
                      )}
                      {log.old_value?.admin_role && log.new_value?.admin_role && (
                        <span className="text-muted-foreground">→</span>
                      )}
                      {log.new_value?.admin_role && (
                        <Badge variant="default" className="text-xs">
                          {String(log.new_value.admin_role).replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(log.created_at), 'MMM d, yyyy · h:mm a')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
