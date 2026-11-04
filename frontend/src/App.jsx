import { useEffect, useState } from "react";
import { apiRequest, clearToken } from "./api";
import Login from "./pages/Login";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import Dashboard from "./pages/Dashboard";
import AcceptInvite from "./pages/AcceptInvite";
import PendingRequests from "./pages/PendingRequests";
import AdminOverview from "./pages/AdminOverview";
import EmployeeDocuments from "./pages/EmployeeDocuments";
import AccountSettings from "./pages/AccountSettings";

function navigate(path, replace = false) {
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [token, setToken] = useState(() =>
    localStorage.getItem("employee_management_token")
  );
  const [account, setAccount] = useState(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(token));
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const inviteToken = new URLSearchParams(window.location.search).get("invite_token");

  useEffect(() => {
    function updatePathname() {
      setPathname(window.location.pathname);
    }

    window.addEventListener("popstate", updatePathname);
    return () => window.removeEventListener("popstate", updatePathname);
  }, []);

  useEffect(() => {
    if (inviteToken) {
      setCheckingSession(false);
      return;
    }

    if (!token) {
      setCheckingSession(false);
      setAccount(null);
      return;
    }

    apiRequest("/auth/me")
      .then((data) => setAccount(data))
      .catch(() => {
        clearToken();
        setToken(null);
        setAccount(null);
      })
      .finally(() => setCheckingSession(false));
  }, [inviteToken, token]);

  useEffect(() => {
    if (inviteToken) return;
    if (checkingSession) return;

    if (token && account && !["admin", "employee"].includes(account.role)) {
      clearToken();
      setToken(null);
      setAccount(null);
      return;
    }

    if (token && account) {
      if (pathname === "/login") {
        clearToken();
        setToken(null);
        setAccount(null);
        return;
      }

      const requestedPath = pathname.replace(/\/+$/, "") || "/";
      const adminPaths = [
        "/admin",
        "/admin/overview",
        "/admin/directory",
        "/admin/employees",
        "/admin/requests",
        "/admin/settings",
      ];
      const employeePaths = ["/employee", "/employee/documents", "/employee/settings"];
      const allowedPath = account.role === "admin"
        ? adminPaths.includes(requestedPath) ? requestedPath : "/admin"
        : employeePaths.includes(requestedPath) ? requestedPath : "/employee";
      const requestedRole = requestedPath === "/admin" || requestedPath.startsWith("/admin/")
        ? "admin"
        : requestedPath === "/employee" || requestedPath.startsWith("/employee/")
          ? "employee"
          : null;

      if (requestedRole && requestedRole !== account.role) {
        clearToken();
        setToken(null);
        setAccount(null);
        navigate("/login", true);
        return;
      }

      if (account.role === "admin" && requestedPath === "/admin/employees") {
        navigate("/admin/directory", true);
        return;
      }

      if (pathname !== allowedPath) {
        navigate(allowedPath, true);
      }
      return;
    }

    if (pathname !== "/login") {
      navigate("/login", true);
    }
  }, [account, checkingSession, inviteToken, pathname, token]);

  function onLogin(result) {
    setToken(result.access_token);
    setAccount({ email: result.email, role: result.role });
    setCheckingSession(false);
    navigate(result.role === "admin" ? "/admin" : "/employee");
  }

  function onLogout() {
    clearToken();
    setToken(null);
    setAccount(null);
    navigate("/login", true);
  }

  if (inviteToken) {
    return <AcceptInvite token={inviteToken} />;
  }

  if (checkingSession) {
    return (
      <div className="session-check">
        <span className="loader" />
        <strong>Checking your session…</strong>
      </div>
    );
  }

  if (!token || !account) {
    return <Login onLogin={onLogin} />;
  }

  if (account.role === "employee") {
    if (pathname.replace(/\/+$/, "") === "/employee/settings") {
      return (
        <AccountSettings
          role="employee"
          email={account.email}
          onBack={() => navigate("/employee")}
          onLogout={onLogout}
          onAccountUpdated={(updated) =>
            setAccount((current) => ({ ...current, email: updated.email }))
          }
        />
      );
    }

    if (pathname.replace(/\/+$/, "") === "/employee/documents") {
      return (
        <EmployeeDocuments
          email={account.email}
          onBack={() => navigate("/employee")}
          onOpenSettings={() => navigate("/employee/settings")}
          onLogout={onLogout}
        />
      );
    }

    return (
      <EmployeeDashboard
        email={account.email}
        onLogout={onLogout}
        onOpenSettings={() => navigate("/employee/settings")}
        onOpenDocuments={() => navigate("/employee/documents")}
      />
    );
  }

  if (account.role === "admin") {
    if (pathname.replace(/\/+$/, "") === "/admin/settings") {
      return (
        <AccountSettings
          role="admin"
          email={account.email}
          onBack={() => navigate("/admin/overview")}
          onLogout={onLogout}
          onAccountUpdated={(updated) =>
            setAccount((current) => ({ ...current, email: updated.email }))
          }
        />
      );
    }

    if (pathname.replace(/\/+$/, "") === "/admin/requests") {
      return (
        <PendingRequests
          email={account.email}
          onLogout={onLogout}
          onBack={() => navigate("/admin/directory")}
          onOpenSettings={() => navigate("/admin/settings")}
        />
      );
    }

    if (pathname.replace(/\/+$/, "") === "/admin/directory") {
      return (
        <Dashboard
          email={account.email}
          onLogout={onLogout}
          onOpenRequests={() => navigate("/admin/requests")}
          onNavigateOverview={() => navigate("/admin/overview")}
          onNavigateEmployees={() => navigate("/admin/directory")}
          onNavigateSettings={() => navigate("/admin/settings")}
        />
      );
    }

    return (
      <AdminOverview
        email={account.email}
        onLogout={onLogout}
        onOpenRequests={() => navigate("/admin/requests")}
        onNavigateEmployees={() => navigate("/admin/directory")}
        onNavigateOverview={() => navigate("/admin/overview")}
        onNavigateSettings={() => navigate("/admin/settings")}
      />
    );
  }

  return <Login onLogin={onLogin} />;
}
