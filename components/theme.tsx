"use client";
import { useSyncExternalStore } from "react";
const subscribe = (cb: () => void) => {
  window.addEventListener("themechange", cb);
  return () => window.removeEventListener("themechange", cb);
};
const snapshot = () => document.documentElement.dataset.theme === "dark";
export function Theme() {
  const dark = useSyncExternalStore(subscribe, snapshot, () => false);
  return (
    <button
      className="theme-toggle"
      onClick={() => {
        document.documentElement.dataset.theme = dark ? "light" : "dark";
        localStorage.setItem("pain-theme", dark ? "light" : "dark");
        window.dispatchEvent(new Event("themechange"));
      }}
      aria-label="Toggle color theme"
    >
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
