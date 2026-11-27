import { useEffect, useState } from 'react';

/** Follow the listener's local calendar, including while the app remains open. */
export function useDecember() {
  const [isDecember, setIsDecember] = useState(() => new Date().getMonth() === 11);

  useEffect(() => {
    const update = () => setIsDecember(new Date().getMonth() === 11);
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  return isDecember;
}
