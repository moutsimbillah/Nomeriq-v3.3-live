import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile, Subscription, AppRole } from '@/types/database';
import { pickPrimarySubscription } from '@/lib/subscription-selection';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  subscription: Subscription | null;
  roles: AppRole[];
  isLoading: boolean;
  isAdmin: boolean;
  hasActiveSubscription: boolean;
  needsBalanceSetup: boolean;
  signUp: (email: string, password: string, firstName?: string, lastName?: string, phone?: string, country?: string, telegramUsername?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setAccountBalance: (balance: number) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = roles.includes('admin');
  const hasActiveSubscription = subscription?.status === 'active' &&
    (!subscription?.expires_at || new Date(subscription.expires_at) > new Date());
  const needsBalanceSetup = profile !== null && profile.account_balance === null;

  const fetchUserData = async (userId: string) => {
    // Important: keep isLoading true until roles/subscription are fetched.
    // Otherwise ProtectedRoute(requireAdmin) can redirect before roles arrive.
    setIsLoading(true);
    try {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      setProfile((profileData ?? null) as Profile | null);

      // Fetch subscriptions and select the primary one using shared rules.
      const { data: subRows } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      const primarySub = pickPrimarySubscription((subRows || []) as Subscription[]);
      setSubscription((primarySub ?? null) as Subscription | null);

      // Fetch roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      setRoles((rolesData ?? []).map((r) => r.role as AppRole));

      // Update last_login for admin users
      const { data: adminRoleData } = await supabase
        .from('admin_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (adminRoleData) {
        await supabase
          .from('admin_roles')
          .update({ last_login: new Date().toISOString() })
          .eq('user_id', userId);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchUserData(user.id);
    }
  };

  // Use a ref to track user ID to avoid stale closure issues in auth callback
  const currentUserIdRef = useRef<string | null>(null);
  const currentAccessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupRealtimeForUser = (userId: string) => {
      const refreshPrimarySubscription = async () => {
        const { data: subRows, error } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });

        if (error) {
          console.error('[AuthContext] Error refreshing subscriptions from realtime event:', error);
          return;
        }

        const primarySub = pickPrimarySubscription((subRows || []) as Subscription[]);
        setSubscription((primarySub ?? null) as Subscription | null);
      };

      // Subscribe to realtime changes for this user's profile and subscription
      realtimeChannel = supabase
        .channel(`user_data_${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
          (payload) => {
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              setProfile(payload.new as Profile);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
          () => {
            // Never trust a single changed row as "current subscription".
            // Recompute from all rows to keep state consistent with page refresh logic.
            void refreshPrimarySubscription();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.${userId}` },
          () => {
            // Refetch roles on change
            supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', userId)
              .then(({ data }) => {
                setRoles((data ?? []).map((r) => r.role as AppRole));
              });
          }
        )
        .subscribe();
    };

    // Set up auth state listener BEFORE getting session
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Only show loading and refetch for actual auth changes, not token refreshes
        // This prevents the UI from blinking when switching tabs
        if (event === 'TOKEN_REFRESHED') {
          // Token was refreshed - update session but don't reload everything
          setSession(session);
          return;
        }

        if (event === 'SIGNED_OUT') {
          console.log('[AuthContext] User signed out');
          currentUserIdRef.current = null;
          currentAccessTokenRef.current = null;
          setSession(null);
          setUser(null);
          setProfile(null);
          setSubscription(null);
          setRoles([]);
          setIsLoading(false);
          // Clean up realtime channel
          if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
          }
          return;
        }

        // For SIGNED_IN, INITIAL_SESSION, USER_UPDATED events
        if (session?.user) {
          // Check email verification BEFORE allowing the session
          const isCustomVerified = session.user.user_metadata?.custom_email_verified === true;

          if (!isCustomVerified) {
            console.log('[AuthContext] User not verified, signing out:', session.user.email);
            // Sign out unverified users immediately - don't set any state
            setIsLoading(false);
            await supabase.auth.signOut();
            return;
          }

          // Use ref to check if user actually changed (avoids stale closure issue)
          const userChanged = session.user.id !== currentUserIdRef.current;

          if (userChanged) {
            console.log('[AuthContext] Auth event:', event, 'userChanged:', userChanged, 'newUserId:', session.user.id);
          }

          // Update the ref immediately
          currentUserIdRef.current = session.user.id;
          const tokenChanged = currentAccessTokenRef.current !== session.access_token;
          currentAccessTokenRef.current = session.access_token;

          // Only set loading if user actually changed
          if (userChanged) {
            setIsLoading(true);
          }

          // Avoid redundant rerenders on repeated SIGNED_IN events for same user/token
          if (userChanged || tokenChanged) {
            setSession(session);
          }
          if (userChanged) {
            setUser(session.user);
          }

          // Use setTimeout to avoid potential deadlock with Supabase
          setTimeout(() => {
            if (userChanged) {
              fetchUserData(session.user.id);
            }
            // Always ensure realtime is set up
            if (!realtimeChannel) {
              setupRealtimeForUser(session.user.id);
            }
          }, 0);
        } else {
          currentUserIdRef.current = null;
          currentAccessTokenRef.current = null;
          setSession(null);
          setUser(null);
          setProfile(null);
          setSubscription(null);
          setRoles([]);
          setIsLoading(false);
          // Clean up realtime channel
          if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
          }
        }
      }
    );

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // Check email verification on initial load
        const isCustomVerified = session.user.user_metadata?.custom_email_verified === true;

        if (!isCustomVerified) {
          console.log('[AuthContext] Initial session not verified, signing out');
          await supabase.auth.signOut();
          setIsLoading(false);
          return;
        }

        setSession(session);
        setUser(session.user);
        currentUserIdRef.current = session.user.id;
        currentAccessTokenRef.current = session.access_token;
        await fetchUserData(session.user.id);
        setupRealtimeForUser(session.user.id);
      } else {
        setSession(null);
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => {
      authSubscription.unsubscribe();
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  const signUp = async (email: string, password: string, firstName?: string, lastName?: string, phone?: string, country?: string, telegramUsername?: string) => {
    try {
      // Use signUp without email confirmation to prevent Supabase's built-in email
      // We'll send our own branded email via the send-verification-email edge function
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Don't set emailRedirectTo - we handle verification ourselves
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            country: country,
            telegram_username: telegramUsername,
          }
        }
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setSubscription(null);
    setRoles([]);
  };

  const setAccountBalance = async (balance: number) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          account_balance: balance,
          starting_balance: balance,
          balance_set_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      await refreshProfile();
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        subscription,
        roles,
        isLoading,
        isAdmin,
        hasActiveSubscription,
        needsBalanceSetup,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        setAccountBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
