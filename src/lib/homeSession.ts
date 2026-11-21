export function homeSessionQueryKey(sessionScope: string | undefined, queryKey: readonly unknown[]): readonly unknown[] {
  return sessionScope ? ['home-session', sessionScope, ...queryKey] : queryKey;
}
