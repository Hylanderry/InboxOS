import { useState, useEffect } from "react";

/**
 * Hook que monitora o estado de conexão de rede do navegador.
 * Retorna `true` quando online, `false` quando offline.
 * Usa os eventos nativos `online`/`offline` do navegador + verificação periódica
 * via `navigator.onLine` como fallback para casos onde os eventos não disparam.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Verificação periódica como fallback (alguns navegadores não disparam eventos)
    const interval = setInterval(() => {
      setIsOnline(navigator.onLine);
    }, 30_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}