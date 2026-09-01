import React from 'react';

import type { ProState } from '../types/pro';
import {
  activateLicenseKey,
  clearSavedProState,
  loadSavedProState,
} from '../utils/license';
import { createFreeProState, type ProLicenseActivationResult } from '../utils/license-state';

interface ProContextValue {
  proState: ProState;
  isLoading: boolean;
  activate: (licenseKey: string) => Promise<ProLicenseActivationResult>;
  deactivate: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ProContext = React.createContext<ProContextValue | null>(null);

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [proState, setProState] = React.useState<ProState>(createFreeProState(''));
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const nextState = await loadSavedProState();
    setProState(nextState);
  }, []);

  React.useEffect(() => {
    let disposed = false;

    void loadSavedProState().then(state => {
      if (!disposed) {
        setProState(state);
        setIsLoading(false);
      }
    });

    return () => {
      disposed = true;
    };
  }, []);

  const activate = React.useCallback(async (licenseKey: string) => {
    const result = await activateLicenseKey(licenseKey);
    if (result.success) setProState(result.state);
    return result;
  }, []);

  const deactivate = React.useCallback(async () => {
    await clearSavedProState();
    setProState(createFreeProState(proState.deviceId));
  }, [proState.deviceId]);

  const value = React.useMemo(
    () => ({ proState, isLoading, activate, deactivate, refresh }),
    [activate, deactivate, isLoading, proState, refresh],
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro(): ProContextValue {
  const context = React.use(ProContext);
  if (!context) throw new Error('usePro must be used within ProProvider');
  return context;
}
