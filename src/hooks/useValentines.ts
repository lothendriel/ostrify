import { useEffect, useState } from 'react';

/** February 1 through 14, using the listener's local calendar. */
export function isValentinesDate(date: Date): boolean {
  return date.getMonth() === 1 && date.getDate() <= 14;
}

export function useValentines() {
  const [isValentines, setIsValentines] = useState(() => isValentinesDate(new Date()));

  useEffect(() => {
    let timer: number;
    const update = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setIsValentines(isValentinesDate(now));
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(update, Math.max(1, nextMidnight.getTime() - now.getTime()));
    };
    update();
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  return isValentines;
}
