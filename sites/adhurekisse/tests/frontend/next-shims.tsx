import { useMemo, type AnchorHTMLAttributes } from "react";

export default function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) { return <a {...props} />; }
export function useRouter() {
  return useMemo(() => ({ replace: (path: string) => { window.history.replaceState(null, "", path); window.dispatchEvent(new PopStateEvent("popstate")); } }), []);
}
