"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "success" | "error";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((prev) => [...prev.slice(-4), { id, kind, message }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-3 lg:bottom-6"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md rounded-lg border px-4 py-2.5 text-sm shadow-soft ${
              t.kind === "success"
                ? "border-brand-200 bg-brand-50 text-brand-900"
                : "border-red-200 bg-red-50 text-signal-bad"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      success: () => undefined,
      error: () => undefined,
    };
  }
  return ctx;
}
