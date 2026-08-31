import { useEffect, useState } from 'react';
import { useAppTheme } from '@/theme';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);
  const { theme } = useAppTheme();

  useEffect(() => {
    // Avoid synchronous state updates during initial render phase
    const timeout = setTimeout(() => {
      setHasHydrated(true);
    }, 0);
    return () => clearTimeout(timeout);
  }, []);

  if (hasHydrated) {
    return theme;
  }

  return 'light';
}

