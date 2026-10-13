import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import AdminPage from "../../app/admin/page";
import LoginPage from "../../app/login/page";
import PrivateLibrary from "../../components/private-library/PrivateLibrary";
import { TestPlayerProvider } from "./player-shim";

// Real owned components with a test-only shared-player/navigation boundary.
function Harness() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => { const update = () => setPath(window.location.pathname); window.addEventListener("popstate", update); return () => window.removeEventListener("popstate", update); }, []);
  return <TestPlayerProvider>{path === "/admin" ? <AdminPage /> : path === "/login" ? <LoginPage /> : <PrivateLibrary />}</TestPlayerProvider>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
