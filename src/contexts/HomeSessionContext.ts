import { createContext, useContext } from 'react';

const HomeSessionContext = createContext<string | undefined>(undefined);

export const HomeSessionProvider = HomeSessionContext.Provider;

export function useHomeSessionScope(): string | undefined {
  return useContext(HomeSessionContext);
}
