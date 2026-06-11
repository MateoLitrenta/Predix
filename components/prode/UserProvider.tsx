"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface UserContextType {
  userId: string | null;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType>({ userId: null, isLoading: true });

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      
      // Intentar refrescar la sesión primero por si está obsoleta
      await supabase.auth.refreshSession();
      
      const { data: { session } } = await supabase.auth.getSession();
      
      const id = session?.user?.id || null;
      setUserId(id);
      setIsLoading(false);
      
      console.log("Contexto de usuario cargado:", id);
    };

    fetchUser();
    
    // Escuchar cambios de autenticación
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id || null;
      setUserId(id);
      console.log("Contexto de usuario actualizado:", id);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <UserContext.Provider value={{ userId, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useProdeUser() {
  return useContext(UserContext);
}
