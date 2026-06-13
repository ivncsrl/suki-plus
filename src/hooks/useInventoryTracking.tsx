import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface InventoryTrackingContextType {
  trackInventory: boolean;
  loading: boolean;
  setTrackInventory: (value: boolean) => Promise<void>;
}

const InventoryTrackingContext = createContext<InventoryTrackingContextType>({
  trackInventory: false,
  loading: true,
  setTrackInventory: async () => {},
});

export const useInventoryTracking = () => useContext(InventoryTrackingContext);

export const InventoryTrackingProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [trackInventory, setTrackInventoryState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('track_inventory')
        .eq('user_id', user.id)
        .maybeSingle();
      setTrackInventoryState(Boolean((data as any)?.track_inventory));
      setLoading(false);
    })();
  }, [user]);

  const setTrackInventory = useCallback(async (value: boolean) => {
    if (!user) return;
    setTrackInventoryState(value);
    await supabase
      .from('profiles')
      .update({ track_inventory: value } as any)
      .eq('user_id', user.id);
  }, [user]);

  return (
    <InventoryTrackingContext.Provider value={{ trackInventory, loading, setTrackInventory }}>
      {children}
    </InventoryTrackingContext.Provider>
  );
};
