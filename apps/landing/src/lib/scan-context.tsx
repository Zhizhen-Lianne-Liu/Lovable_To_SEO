import { createContext, useContext, useState, type ReactNode } from "react";
import { scan as scanApi, type ScanResult } from "./scan-api";

type ScanState = {
  result: ScanResult | null;
  scanning: string | null;
  error: string | null;
};

type ScanContextValue = ScanState & {
  scan: (url: string) => Promise<void>;
};

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ScanState>({
    result: null,
    scanning: null,
    error: null,
  });

  const scan = async (url: string) => {
    setState({ result: null, scanning: url, error: null });
    try {
      const r = await scanApi(url);
      setState({ result: r, scanning: url, error: null });
    } catch (e) {
      setState({ result: null, scanning: url, error: (e as Error).message });
    }
  };

  return <ScanContext.Provider value={{ ...state, scan }}>{children}</ScanContext.Provider>;
}

export function useScan(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) {
    throw new Error("useScan must be used inside <ScanProvider>");
  }
  return ctx;
}
