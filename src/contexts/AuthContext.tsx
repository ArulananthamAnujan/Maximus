import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, OrgMember } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  orgMembership: OrgMember | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, session: null, orgMembership: null, loading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  signInWithGoogle: async () => {},
  signInWithMicrosoft: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [orgMembership, setOrgMembership] = useState<OrgMember | null>(null);
  const [loading, setLoading] = useState(true);
  // Id of the user whose profile is currently loaded (avoids refetching on token refresh / tab focus)
  const loadedUserIdRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (data && !error) {
        // Deactivated accounts are signed straight back out.
        if (data.is_active === false) {
          loadedUserIdRef.current = null;
          setProfile(null);
          setOrgMembership(null);
          await supabase.auth.signOut();
          return;
        }
        loadedUserIdRef.current = userId;
        setProfile(data as Profile);
        // fetch org membership for org_admin / teacher roles
        if (data.role === 'org_admin' || data.role === 'teacher') {
          const { data: mem } = await supabase
            .from('org_members')
            .select('*, organization:organizations(*)')
            .eq('user_id', userId)
            .maybeSingle();
          setOrgMembership(mem as OrgMember | null);
        } else {
          setOrgMembership(null);
        }
      }
    } catch {
      // silently fail — user is still authenticated
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) await fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // supabase-js re-emits SIGNED_IN on every tab focus and token refresh. Only load the
        // profile when the signed-in user actually changed, otherwise pages reset themselves.
        if (loadedUserIdRef.current === session.user.id) return;
        const userId = session.user.id;
        setLoading(true);
        // Defer: calling supabase from inside this callback can deadlock the auth client.
        setTimeout(async () => {
          await fetchProfile(userId);
          setLoading(false);
        }, 0);
      } else {
        loadedUserIdRef.current = null;
        setProfile(null);
        setOrgMembership(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    // Self-registration always creates a student. Staff accounts are created by an admin.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    // With email confirmation switched on, Supabase returns a user but no session.
    return { error: error as Error | null, needsEmailConfirmation: !error && !data.session };
  };

  const signOut = async () => {
    loadedUserIdRef.current = null;
    setProfile(null);
    setUser(null);
    setSession(null);
    setOrgMembership(null);
    await supabase.auth.signOut();
  };

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  const signInWithMicrosoft = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, orgMembership, loading, signIn, signUp, signOut, signInWithGoogle, signInWithMicrosoft, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
