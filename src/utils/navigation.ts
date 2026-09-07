interface BackNavigation {
  canGoBack: () => boolean;
  back: () => void;
  replace: (path: '/') => void;
}

export function goBackOrHome(router: BackNavigation): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace('/');
}
