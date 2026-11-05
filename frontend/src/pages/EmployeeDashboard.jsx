import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import { initials } from "../components/helpers";
import useAutoRefresh from "../hooks/useAutoRefresh";

export default function EmployeePortal({ email, onLogout, onOpenSettings, onOpenDocuments }) {
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadEmployee = useCallback(async () => {
    try {
      setEmployee(await apiRequest("/employees/me"));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  useAutoRefresh(loadEmployee);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <ThemeToggle />
          <span className="user-badge">
            <span className="live-dot" /> Employee portal
          </span>
          <button className="refresh-button" type="button" onClick={onOpenDocuments}>
            Documents
          </button>
          <button className="refresh-button" type="button" onClick={onOpenSettings}>
            Settings
          </button>
          <button className="logout-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard employee-dashboard">
        <section className="page-heading">
          <div>
            <p className="eyebrow">MY WORKSPACE / PROFILE</p>
            <h1>
              Welcome{employee ? ", " + employee.name.split(" ")[0] : ""}
            </h1>
            <p className="page-description">
              View your details and manage your account from Settings.
            </p>
          </div>
          <div className="heading-badge">
            <span className="live-dot" /> Signed in as {email}
          </div>
        </section>

        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {loading ? (
          <section className="panel profile-loading">
            <span className="loader" />
            <strong>Loading your profile…</strong>
          </section>
        ) : employee ? (
          <>
            <section className="summary-grid employee-summary">
              <article className="summary-card">
                <span className="avatar profile-avatar">
                  {initials(employee.name)}
                </span>
                <div>
                  <p>Employee</p>
                  <strong>{employee.name}</strong>
                </div>
                <span className="summary-caption">Your account</span>
              </article>

              <article className="summary-card">
                <div className="summary-icon department-icon">D</div>
                <div>
                  <p>Department</p>
                  <strong className="department-value">
                    {employee.department}
                  </strong>
                </div>
                <span className="summary-caption">Your team</span>
              </article>
            </section>

            <section className="panel profile-panel">
              <div className="directory-heading">
                <div>
                  <p className="panel-kicker">PERSONAL DETAILS</p>
                  <h2>My employee profile</h2>
                  <span className="employee-id-badge">
                    Employee ID: {employee.employee_number}
                  </span>
                </div>
              </div>

              <div className="profile-fields">
                <div className="profile-field"><span>Full name</span><strong>{employee.name}</strong></div>
                <div className="profile-field"><span>Email address</span><strong>{employee.email}</strong></div>
                <div className="profile-field"><span>Department</span><strong>{employee.department}</strong></div>
                <div className="profile-field"><span>Contact number</span><strong>{employee.contact_number || "Not provided"}</strong></div>
                <div className="profile-field"><span>Address</span><strong>{employee.address || "Not provided"}</strong></div>
              </div>
            </section>

            <section className="panel document-panel employee-documents-shortcut">
              <div className="directory-heading">
                <div>
                  <p className="panel-kicker">DOCUMENTS</p>
                  <h2>Aadhaar and resume</h2>
                  <p className="document-help-copy">Upload documents and review their extracted text on your private documents page.</p>
                </div>
                <button className="primary-button" type="button" onClick={onOpenDocuments}>Open my documents <span aria-hidden="true">→</span></button>
              </div>
            </section>


          </>
        ) : null}
      </main>
    </div>
  );
}
