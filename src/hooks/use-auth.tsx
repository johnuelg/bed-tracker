import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/types/hospital";

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const db = supabase as any;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const loadProfileAndRoles = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setRoles([]);
      return;
    }

    const { data: existingProfile } = await db
      .from("profiles")
      .select("id,user_id,display_name,is_active")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (!existingProfile) {
      await db.from("profiles").insert({ user_id: currentUser.id, display_name: currentUser.email?.split("@")[0] ?? "User" });
    }

    const { data: profileData } = await db
      .from("profiles")
      .select("id,user_id,display_name,is_active")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    const { data: rolesData } = await db.from("user_roles").select("role").eq("user_id", currentUser.id);

    const mappedRoles = (rolesData?.map((row: { role: string }) => row.role) ?? []) as AppRole[];

    if (mappedRoles.length === 0) {
      await db.from("user_roles").insert({ user_id: currentUser.id, role: "admin" });
      const { data: refreshedRoles } = await db.from("user_roles").select("role").eq("user_id", currentUser.id);
      setRoles((refreshedRoles?.map((row: { role: string }) => row.role) ?? []) as AppRole[]);
    } else {
      setRoles(mappedRoles);
    }

    setProfile(profileData ?? null);
  }, []);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      void loadProfileAndRoles(nextSession?.user ?? null);
      setLoading(false);
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setUser(data.session?.user ?? null);
      void loadProfileAndRoles(data.session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [loadProfileAndRoles]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfileAndRoles(user);
  }, [loadProfileAndRoles, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user,
      profile,
      roles,
      isAuthenticated: Boolean(session?.user),
      signIn,
      signOut,
      refreshProfile,
    }),
    [loading, session, user, profile, roles, signIn, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
