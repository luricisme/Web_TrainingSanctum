"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface FocusModeValue {
  focused: boolean;
  setFocused: (focused: boolean) => void;
}

const FocusModeContext = createContext<FocusModeValue>({
  focused: false,
  setFocused: () => {},
});

/**
 * spec-4-5 focus mode (FR-11): one client flag for the whole shell. While it
 * is on, the sidebar is not rendered, so a Review or Learn session has only
 * the card on screen. Sessions turn it on with `useFocusMode`; nothing else
 * reads the route.
 */
export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focused, setFocused] = useState(false);
  const value = useMemo(() => ({ focused, setFocused }), [focused]);
  return <FocusModeContext.Provider value={value}>{children}</FocusModeContext.Provider>;
}

/** True while a session has focus mode on. */
export function useIsFocused(): boolean {
  return useContext(FocusModeContext).focused;
}

/**
 * Turns focus mode on while `active`, and off again when it turns false or
 * the caller unmounts (finish, error, Back, an in-app link). A layout effect,
 * so the sidebar is gone before the session's first paint, and a hand-off
 * from a loading component to the session never shows the chrome in between.
 */
export function useFocusMode(active: boolean): void {
  const { setFocused } = useContext(FocusModeContext);
  useLayoutEffect(() => {
    if (!active) return;
    setFocused(true);
    return () => setFocused(false);
  }, [active, setFocused]);
}
