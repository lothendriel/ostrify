import { useEffect, useState } from 'react';

/** Follow the listener's local calendar, including while the app remains open. */
function useCalendarMonth(month: number) {
  const [isMonth, setIsMonth] = useState(() => new Date().getMonth() === month);

  useEffect(() => {
    const update = () => setIsMonth(new Date().getMonth() === month);
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [month]);

  return isMonth;
}

export function useDecember() {
  return useCalendarMonth(11);
}

export function useOctober() {
  return useCalendarMonth(9);
}
