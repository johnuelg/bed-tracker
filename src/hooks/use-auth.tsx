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
  profileLoading: boolean;
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
  const [profileLoading, setProfileLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const loadProfileAndRoles = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setRoles([]);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);

    try {
      const [{ data: existingProfile }, { data: rolesData }] = await Promise.all([
        db.from("profiles").select("id,user_id,display_name,is_active").eq("user_id", currentUser.id).maybeSingle(),
        db.from("user_roles").select("role").eq("user_id", currentUser.id),
      ]);

      let resolvedProfile = existingProfile;

      if (!resolvedProfile) {
        await db.from("profiles").insert({ user_id: currentUser.id, display_name: currentUser.email?.split("@")[0] ?? "User" });
        const { data: createdProfile } = await db
          .from("profiles")
          .select("id,user_id,display_name,is_active")
          .eq("user_id", currentUser.id)
          .maybeSingle();
        resolvedProfile = createdProfile;
      }

      const mappedRoles = (rolesData?.map((row: { role: string }) => row.role) ?? []) as AppRole[];

      if (mappedRoles.length === 0) {
        await db.from("user_roles").insert({ user_id: currentUser.id, role: "admin" });
        setRoles(["admin"]);
      } else {
        setRoles(mappedRoles);
      }

      setProfile(resolvedProfile ?? null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const hydrateAuthState = async (nextSession: Session | null) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        await loadProfileAndRoles(null);
        setLoading(false);
        return;
      }

      setLoading(false);
      void loadProfileAndRoles(nextSession.user);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrateAuthState(nextSession);
    });

    void supabase.auth.getSession().then(({ data }) => {
      void hydrateAuthState(data.session ?? null);
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
      profileLoading,
      session,
      user,
      profile,
      roles,
      isAuthenticated: Boolean(session?.user),
      signIn,
      signOut,
      refreshProfile,
    }),
    [loading, profileLoading, session, user, profile, roles, signIn, signOut, refreshProfile],
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
