import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import { initials } from "../components/helpers";
import useAutoRefresh from "../hooks/useAutoRefresh";

export default function PendingRequests({ email, onLogout, onBack, onOpenSettings }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRequests = useCallback(async () => {
    try {
      setRequests(await apiRequest("/admin/requests"));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load employee requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useAutoRefresh(loadRequests);

  async function handleDecision(employee, decision) {
    setBusyId(employee.id);
    setError("");
    setNotice("");

    try {
      const result = await apiRequest(
        `/employees/${employee.id}/${decision}`,
        { method: "POST" }
      );
      setNotice(result.message);
      await loadRequests();
    } catch (err) {
      setError(err.message || "Could not update this request.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <ThemeToggle />
          <button className="docs-link requests-back-link" onClick={onBack}>
            ← Employee directory
          </button>
          <button className="refresh-button" type="button" onClick={onOpenSettings}>
            Settings
          </button>
          <span className="user-badge">
            <span className="live-dot" /> Admin · {email}
          </span>
          <button className="logout-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard admin-dashboard pending-requests-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">ADMINISTRATION / REQUESTS</p>
            <h1>Employee requests</h1>
            <p className="page-description">
              Review employee registrations and choose whether to approve them.
            </p>
          </div>
          <div className="heading-badge">
            <span className="live-dot" /> {requests.length} pending
          </div>
        </section>

        {error && <div className="alert" role="alert">{error}</div>}
        {notice && <div className="request-success" role="status">{notice}</div>}

        {loading ? (
          <section className="panel request-empty-state">
            <span className="loader" />
            <strong>Loading employee requests…</strong>
          </section>
        ) : requests.length === 0 ? (
          <section className="panel request-empty-state">
            <span className="request-empty-icon" aria-hidden="true">✓</span>
            <h2>All caught up</h2>
            <p>New employee registration requests will appear here.</p>
          </section>
        ) : (
          <section className="request-list" aria-label="Pending employee requests">
            {requests.map((employee) => (
              <article className="panel request-card" key={employee.id}>
                <div className="request-person">
                  <span className="request-avatar" aria-hidden="true">
                    {initials(employee.name)}
                  </span>
                  <div>
                    <h2>{employee.name}</h2>
                    <p>{employee.email}</p>
                  </div>
                </div>
                <dl className="request-details">
                  <div>
                    <dt>Department</dt>
                    <dd>{employee.department || "—"}</dd>
                  </div>
                  <div>
                    <dt>Contact</dt>
                    <dd>{employee.contact_number || "—"}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{employee.address || "—"}</dd>
                  </div>
                </dl>
                <div className="request-actions">
                  <button
                    className="request-decline-button"
                    disabled={busyId === employee.id}
                    onClick={() => handleDecision(employee, "decline")}
                  >
                    Decline
                  </button>
                  <button
                    className="request-approve-button"
                    disabled={busyId === employee.id}
                    onClick={() => handleDecision(employee, "approve")}
                  >
                    {busyId === employee.id ? "Saving…" : "Approve request"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
