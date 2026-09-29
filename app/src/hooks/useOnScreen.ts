import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Whether the app is on screen: nothing redraws a clock, glides or drives a map in a pocket. */
export const useOnScreen = (): boolean => {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => setActive(next === 'active'));
    return () => sub.remove();
  }, []);
  return active;
};
