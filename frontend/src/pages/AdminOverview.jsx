import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api";
import Brand from "../components/Brand";

export default function AdminOverview({
  email,
  onLogout,
  onOpenRequests,
  onNavigateEmployees,
  onNavigateOverview,
}) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEmployees = useCallback(async () => {
    try {
      setEmployees(await apiRequest("/employees"));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the employee overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
    const refreshTimer = window.setInterval(loadEmployees, 30000);
    return () => window.clearInterval(refreshTimer);
  }, [loadEmployees]);

  const activeCount = employees.filter(
    (employee) => employee.is_active !== false
  ).length;
  const pendingCount = employees.filter(
    (employee) => employee.account_status === "pending"
  ).length;
  const departments = useMemo(() => {
    const counts = employees.reduce((result, employee) => {
      const name = employee.department || "Unassigned";
      result[name] = (result[name] || 0) + 1;
      return result;
    }, {});

    return Object.entries(counts).sort((first, second) => second[1] - first[1]);
  }, [employees]);

  const statCards = [
    { label: "Total employees", value: employees.length, tone: "blue", mark: "E" },
    { label: "Active employees", value: activeCount, tone: "green", mark: "✓" },
    { label: "Inactive employees", value: employees.length - activeCount, tone: "amber", mark: "–" },
    { label: "Pending requests", value: pendingCount, tone: "violet", mark: "!" },
  ];

  const largestDepartment = Math.max(...departments.map(([, count]) => count), 1);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <nav className="admin-page-nav" aria-label="Admin pages">
            <button className="active" onClick={onNavigateOverview}>
              Overview
            </button>
            <button onClick={onNavigateEmployees}>Employees</button>
          </nav>
          <span className="user-badge">
            <span className="live-dot" /> Admin · {email}
          </span>
          <button
            className="request-notification"
            onClick={onOpenRequests}
            aria-label={`${pendingCount} pending employee requests`}
          >
            <span aria-hidden="true">🔔</span>
            Requests
            {pendingCount > 0 && (
              <span className="request-notification-count">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </button>
          <button className="logout-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard admin-dashboard admin-overview-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">ADMINISTRATION / OVERVIEW</p>
            <h1>Overview</h1>
            <p className="page-description">
              A quick view of your team and the requests that need attention.
            </p>
          </div>
          <div className="heading-badge">
            <span className="live-dot" /> Administrator view
          </div>
        </section>

        {error && <div className="alert" role="alert">{error}</div>}

        {loading ? (
          <section className="panel request-empty-state">
            <span className="loader" />
            <strong>Loading your overview…</strong>
          </section>
        ) : (
          <>
            <section className="overview-stat-grid" aria-label="Employee totals">
              {statCards.map((card) => (
                <article className="panel overview-stat-card" key={card.label}>
                  <span className={`overview-stat-mark ${card.tone}`} aria-hidden="true">
                    {card.mark}
                  </span>
                  <div>
                    <p>{card.label}</p>
                    <strong>{card.value.toLocaleString()}</strong>
                  </div>
                </article>
              ))}
            </section>

            <section className="overview-lower-grid">
              <article className="panel overview-departments">
                <div className="directory-heading">
                  <div>
                    <p className="panel-kicker">TEAM BREAKDOWN</p>
                    <h2>Employees by department</h2>
                  </div>
                  <button className="refresh-button" onClick={onNavigateEmployees}>
                    View employees
                  </button>
                </div>
                {departments.length === 0 ? (
                  <p className="overview-empty-copy">
                    Add an employee to see department totals here.
                  </p>
                ) : (
                  <ul className="department-breakdown-list">
                    {departments.slice(0, 6).map(([name, count]) => (
                      <li key={name}>
                        <div className="department-breakdown-label">
                          <span>{name}</span>
                          <strong>{count}</strong>
                        </div>
                        <span className="department-breakdown-track">
                          <span
                            className="department-breakdown-bar"
                            style={{ width: `${(count / largestDepartment) * 100}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="panel overview-requests-card">
                <p className="panel-kicker">NEEDS ATTENTION</p>
                <h2>Registration requests</h2>
                <p>
                  {pendingCount === 0
                    ? "There are no employee requests waiting for review."
                    : `${pendingCount} employee ${pendingCount === 1 ? "request is" : "requests are"} waiting for your review.`}
                </p>
                <button className="primary-button" onClick={onOpenRequests}>
                  Review requests
                  {pendingCount > 0 && (
                    <span className="overview-request-count">{pendingCount}</span>
                  )}
                </button>
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
