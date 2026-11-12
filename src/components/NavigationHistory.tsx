import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

type HistoryEntry = { key: string; to: string };
type HistorySnapshot = { entries: HistoryEntry[]; index: number };
type NavigationHistoryValue = { previousTo?: string; historyLength: number };

const NavigationHistoryContext = createContext<NavigationHistoryValue>({ historyLength: 1 });

function sameHistory(left: HistorySnapshot, right: HistorySnapshot): boolean {
  return left.index === right.index && left.entries.length === right.entries.length && left.entries.every((entry, index) => {
    const other = right.entries[index];
    return entry.key === other.key && entry.to === other.to;
  });
}

function applyNavigation(history: HistorySnapshot, current: HistoryEntry, navigationType: ReturnType<typeof useNavigationType>): HistorySnapshot {
  const existingIndex = history.entries.findIndex(entry => entry.key === current.key);
  if (navigationType === 'POP') {
    return existingIndex >= 0 ? { ...history, index: existingIndex } : { entries: [current], index: 0 };
  }
  if (current.key === history.entries[history.index]?.key) {
    const entries = history.entries.slice();
    entries[history.index] = current;
    return { ...history, entries };
  }
  if (navigationType === 'REPLACE') {
    const entries = history.entries.slice();
    entries[history.index] = current;
    return { ...history, entries };
  }
  return {
    entries: [...history.entries.slice(0, history.index + 1), current],
    index: history.index + 1,
  };
}

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const current: HistoryEntry = {
    key: location.key,
    to: `${location.pathname}${location.search}${location.hash}`,
  };
  const [history, setHistory] = useState<HistorySnapshot>(() => ({ entries: [current], index: 0 }));
  const activeHistory = useMemo(
    () => applyNavigation(history, current, navigationType),
    [history, location.key, location.pathname, location.search, location.hash, navigationType],
  );

  useLayoutEffect(() => {
    setHistory(previous => sameHistory(previous, activeHistory) ? previous : activeHistory);
  }, [activeHistory]);

  const previousTo = activeHistory.entries[activeHistory.index - 1]?.to;
  return <NavigationHistoryContext.Provider value={{ previousTo, historyLength: activeHistory.index + 1 }}>{children}</NavigationHistoryContext.Provider>;
}

export function usePreviousLocation() {
  return useContext(NavigationHistoryContext);
}
