import { useEffect, useMemo, useState } from "react";
import { apiRequest, downloadFile } from "../api";
import Brand from "../components/Brand";
import { initials } from "../components/helpers";

const emptyForm = {
  name: "",
  email: "",
  department: "",
  contact_number: "",
  address: "",
};

export default function AdminDashboard({
  email,
  onLogout,
  onOpenRequests,
  onNavigateOverview,
  onNavigateEmployees,
}) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdminPasswords, setShowAdminPasswords] = useState(false);
  const [adminPasswordFormOpen, setAdminPasswordFormOpen] = useState(false);
  const [adminPasswordForm, setAdminPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordNotice, setPasswordNotice] = useState("");
  const [documentEmployee, setDocumentEmployee] = useState(null);
  const [employeeDocuments, setEmployeeDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");

  async function loadEmployees() {
    setError("");

    try {
      setEmployees(await apiRequest("/employees"));
    } catch (err) {
      setError(err.message || "Could not load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
    const refreshTimer = window.setInterval(loadEmployees, 30000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  const pendingRequestCount = employees.filter(
    (employee) => employee.account_status === "pending"
  ).length;

  const departmentCount = useMemo(
    () => new Set(employees.map((employee) => employee.department).filter(Boolean)).size,
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return employees;

    return employees.filter((employee) =>
      [
        String(employee.employee_number ?? ""),
        employee.name || "",
        employee.email || "",
        employee.department || "",
      ].some((value) => value.toLowerCase().includes(term))
    );
  }, [employees, search]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setEmployeeFormOpen(false);
    setError("");
  }

  function startAdding() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setEmployeeFormOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setInviteNotice("");
    setSaving(true);

    const employee = {
      email: form.email.trim(),
    };

    try {
      if (editingId) {
        Object.assign(employee, {
          name: form.name.trim(),
          department: form.department.trim(),
          contact_number: form.contact_number.trim(),
          address: form.address.trim(),
        });
        await apiRequest("/employees/" + editingId, {
          method: "PUT",
          body: JSON.stringify(employee),
        });
      } else {
        await apiRequest("/employees", {
          method: "POST",
          body: JSON.stringify(employee),
        });
        setInviteNotice("Invitation sent. The employee can complete their profile and set a password from the email link.");
      }

      resetForm();
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Could not save employee.");
    } finally {
      setSaving(false);
    }
  }

  function startEditing(employee) {
    setEditingId(employee.id);
    setEmployeeFormOpen(true);
    setForm({
      name: employee.name,
      email: employee.email,
      department: employee.department,
      contact_number: employee.contact_number || "",
      address: employee.address || "",
    });
    setError("");
  }

  async function approveEmployee(employee) {
    setError("");

    try {
      await apiRequest("/employees/" + employee.id + "/approve", {
        method: "POST",
      });
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Could not approve registration.");
    }
  }

  async function changeEmployeeStatus(employee) {
    const nextStatus = employee.is_active === false;
    const action = nextStatus ? "activate" : "deactivate";

    if (
      !window.confirm(
        action.charAt(0).toUpperCase() +
          action.slice(1) +
          " " +
          employee.name +
          "?"
      )
    ) {
      return;
    }

    setError("");

    try {
      await apiRequest("/employees/" + employee.id + "/status", {
        method: "PATCH",
        body: JSON.stringify({ is_active: nextStatus }),
      });
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Could not update employee status.");
    }
  }

  async function sendEmployeeInvite(employee) {
    setError("");
    setInviteNotice("");

    try {
      const result = await apiRequest("/employees/" + employee.id + "/invite", {
        method: "POST",
      });
      setInviteNotice(result.message);
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Could not send the employee invitation.");
    }
  }

  async function deleteEmployee(employee) {
    if (
      !window.confirm(
        "Delete " + employee.name + "'s employee record and login?"
      )
    ) {
      return;
    }

    setError("");

    try {
      await apiRequest("/employees/" + employee.id, {
        method: "DELETE",
      });
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Could not delete employee.");
    }
  }

  async function openEmployeeDocuments(employee) {
    setDocumentEmployee(employee);
    setEmployeeDocuments([]);
    setDocumentsError("");
    setDocumentsLoading(true);
    try {
      setEmployeeDocuments(
        await apiRequest(`/employees/${employee.id}/documents`)
      );
    } catch (err) {
      setDocumentsError(err.message || "Could not load employee documents.");
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function downloadEmployeeDocument(documentFile) {
    setDocumentsError("");
    try {
      await downloadFile(
        `/employees/${documentEmployee.id}/documents/${documentFile.id}`,
        documentFile.filename
      );
    } catch (err) {
      setDocumentsError(err.message || "Could not download this document.");
    }
  }

  function updateAdminPasswordForm(event) {
    const { name, value } = event.target;
    setAdminPasswordForm((current) => ({ ...current, [name]: value }));
  }

  async function changeAdminPassword(event) {
    event.preventDefault();
    setError("");
    setPasswordNotice("");

    if (
      adminPasswordForm.new_password !==
      adminPasswordForm.confirm_password
    ) {
      setError("The new passwords do not match.");
      return;
    }

    if (
      adminPasswordForm.current_password ===
      adminPasswordForm.new_password
    ) {
      setError("Choose a new password different from your current one.");
      return;
    }

    try {
      const result = await apiRequest("/admin/me/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: adminPasswordForm.current_password,
          new_password: adminPasswordForm.new_password,
        }),
      });

      setPasswordNotice(result.message);
      setAdminPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
      setShowAdminPasswords(false);
      setAdminPasswordFormOpen(false);
    } catch (err) {
      setError(err.message || "Could not change the administrator password.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <nav className="admin-page-nav" aria-label="Admin pages">
            <button onClick={onNavigateOverview}>Overview</button>
            <button className="active" onClick={onNavigateEmployees}>
              Employees
            </button>
          </nav>
          <span className="user-badge">
            <span className="live-dot" /> Admin · {email}
          </span>

          <button
            className="request-notification"
            onClick={onOpenRequests}
            aria-label={`${pendingRequestCount} pending employee requests`}
          >
            <span aria-hidden="true">🔔</span>
            Requests
            {pendingRequestCount > 0 && (
              <span className="request-notification-count">
                {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
              </span>
            )}
          </button>

          <a
            className="docs-link"
            href="http://127.0.0.1:8000/docs"
            target="_blank"
            rel="noreferrer"
          >
            API docs <span className="docs-icon">↗</span>
          </a>

          <button className="logout-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard admin-dashboard">
        <section className="page-heading">
          <div>
            <p className="eyebrow">ADMINISTRATION / DIRECTORY</p>
            <h1>Employee directory</h1>
            <p className="page-description">
              Manage employee records and login access.
            </p>
          </div>
          <div className="heading-badge">
            <span className="live-dot" /> Administrator view
          </div>
        </section>

        {error && (
          <div className="alert" role="alert">
            <span className="alert-symbol">!</span>
            <span>{error}</span>
            <button
              className="alert-close"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {inviteNotice && (
          <div className="success-alert" role="status">
            {inviteNotice}
          </div>
        )}

        <section className="summary-grid" aria-label="Employee summary">
          <article className="summary-card">
            <div className="summary-icon people-icon">P</div>
            <div>
              <p>Total employees</p>
              <strong>{employees.length}</strong>
            </div>
            <span className="summary-caption">In your directory</span>
          </article>

          <article className="summary-card">
            <div className="summary-icon department-icon">D</div>
            <div>
              <p>Departments</p>
              <strong>{departmentCount}</strong>
            </div>
            <span className="summary-caption">Across your team</span>
          </article>

          <article className="summary-note">
            <div className="note-mark">✓</div>
            <div>
              <strong>Manage your workforce</strong>
              <p>Admins can view, update, and remove all employee records.</p>
            </div>
          </article>
        </section>

        <section className="panel password-panel admin-password-panel">
          <div className="directory-heading">
            <div>
              <p className="panel-kicker">ACCOUNT SECURITY</p>
              <h2>Change administrator password</h2>
              <p className="page-description">
                Update the password for your admin account.
              </p>
            </div>

            <button
              className="refresh-button"
              type="button"
              onClick={() => {
                setAdminPasswordFormOpen((open) => !open);
                setAdminPasswordForm({
                  current_password: "",
                  new_password: "",
                  confirm_password: "",
                });
                setShowAdminPasswords(false);
                setPasswordNotice("");
              }}
            >
              {adminPasswordFormOpen ? "Cancel" : "Change password"}
            </button>
          </div>

          {passwordNotice && (
            <div className="success-alert" role="status">
              {passwordNotice}
            </div>
          )}

          {adminPasswordFormOpen && (
            <form
              className="password-change-form"
              onSubmit={changeAdminPassword}
            >
              <button
                className="refresh-button"
                type="button"
                onClick={() =>
                  setShowAdminPasswords((visible) => !visible)
                }
              >
                {showAdminPasswords ? "Hide passwords" : "Show passwords"}
              </button>
            <label>
              <span>Current password</span>
              <input
                type={showAdminPasswords ? "text" : "password"}
                name="current_password"
                value={adminPasswordForm.current_password}
                onChange={updateAdminPasswordForm}
                autoComplete="current-password"
                required
              />
            </label>

            <label>
              <span>New password</span>
              <input
                type={showAdminPasswords ? "text" : "password"}
                name="new_password"
                value={adminPasswordForm.new_password}
                onChange={updateAdminPasswordForm}
                minLength="8"
                maxLength="128"
                autoComplete="new-password"
                required
              />
            </label>

            <label>
              <span>Confirm new password</span>
              <input
                type={showAdminPasswords ? "text" : "password"}
                name="confirm_password"
                value={adminPasswordForm.confirm_password}
                onChange={updateAdminPasswordForm}
                minLength="8"
                maxLength="128"
                autoComplete="new-password"
                required
              />
            </label>

            <button className="primary-button" type="submit">
              Update admin password
            </button>
            </form>
          )}
        </section>

        <section className="workspace-grid">
          <section className="panel directory-panel">
            <div className="directory-heading">
              <div>
                <p className="panel-kicker">YOUR ORGANIZATION</p>
                <h2>
                  All employees{" "}
                  <span className="count-pill">{employees.length}</span>
                </h2>
              </div>

              <div className="directory-actions">
                <button
                  className="primary-button add-employee-button"
                  type="button"
                  onClick={startAdding}
                >
                  <span aria-hidden="true">+</span> Add employee
                </button>
                <button
                  className="refresh-button"
                  type="button"
                  onClick={loadEmployees}
                  disabled={loading}
                >
                  <span>↻</span> Refresh
                </button>
              </div>
            </div>

            <div className="directory-toolbar">
              <label className="search-box">
                <span className="search-icon" aria-hidden="true">
                  ⌕
                </span>
                <span className="search-id-chip" aria-hidden="true">ID</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Employee ID, name, email, or department"
                  aria-label="Search employees by ID, name, email, or department"
                />
              </label>
              <span className="results-label">
                {filteredEmployees.length}{" "}
                {filteredEmployees.length === 1 ? "result" : "results"}
              </span>
            </div>

            {loading ? (
              <div className="empty-state">
                <span className="loader" />
                <strong>Loading employees</strong>
                <p>Getting the latest directory records.</p>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">{search ? "⌕" : "P"}</span>
                <strong>
                  {search ? "No matches found" : "No employees yet"}
                </strong>
                <p>
                  {search
                    ? "Try another name, email, department, or employee ID."
                    : "Add your first employee using the form."}
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Account status</th>
                      <th>Employment</th>
                      <th className="actions-heading">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => (
                      <tr key={employee.id}>
                        <td>
                          <div className="employee-cell">
                            <span className="avatar">
                              {initials(employee.name || "Employee")}
                            </span>
                            <span className="employee-details">
                              <strong>{employee.name || (employee.account_status === "invited" ? "Profile setup pending" : "—")}</strong>
                              <small>{employee.email}</small>
                              <small className="employee-id">
                                ID: {employee.employee_number}
                              </small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="department-pill">
                            {employee.department || "—"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              "account-status " +
                              (employee.account_status === "approved"
                                ? "active-status"
                                : employee.account_status === "pending" ||
                                    employee.account_status === "invited"
                                  ? "pending-status"
                                  : employee.account_status === "declined"
                                    ? "inactive-status"
                                    : "")
                            }
                          >
                            <span />
                            {employee.account_status === "pending"
                              ? "Pending approval"
                              : employee.account_status === "invited"
                                ? "Invitation sent"
                                : employee.account_status === "approved"
                                  ? "Approved"
                                  : employee.account_status === "declined"
                                    ? "Declined"
                                  : "No login"}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              "account-status " +
                              (employee.is_active === false
                                ? "inactive-status"
                                : "active-status")
                            }
                          >
                            <span />
                            {employee.is_active === false
                              ? "Deactivated"
                              : "Active"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="action-button account-action"
                              onClick={() => openEmployeeDocuments(employee)}
                            >
                              Documents
                            </button>
                            {employee.account_status === "pending" && (
                              <button
                                className="action-button approve-action"
                                onClick={() => approveEmployee(employee)}
                              >
                                Approve
                              </button>
                            )}

                            <button
                              className="action-button edit-action"
                              onClick={() => startEditing(employee)}
                            >
                              Edit
                            </button>

                            {(employee.account_status === "invited" ||
                              employee.account_status === "no_account") && (
                              <button
                                className="action-button account-action"
                                onClick={() => sendEmployeeInvite(employee)}
                              >
                                {employee.has_account ? "Resend invite" : "Send invite"}
                              </button>
                            )}

                            <button
                              className={
                                "action-button " +
                                (employee.is_active === false
                                  ? "approve-action"
                                  : "delete-action")
                              }
                              onClick={() => changeEmployeeStatus(employee)}
                            >
                              {employee.is_active === false
                                ? "Activate"
                                : "Deactivate"}
                            </button>

                            <button
                              className="action-button delete-action"
                              onClick={() => deleteEmployee(employee)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="panel-footer">
              Employee records and login access are managed from this administrator account.
            </div>
          </section>
        </section>

        {employeeFormOpen && (
          <div
            className="employee-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !saving) resetForm();
            }}
          >
          <aside
            className="panel form-panel employee-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-form-title"
          >
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">
                  {editingId ? "UPDATE RECORD" : "NEW RECORD"}
                </p>
                <h2 id="employee-form-title">{editingId ? "Edit employee" : "Add an employee"}</h2>
              </div>
              <button
                className="employee-modal-close"
                type="button"
                onClick={resetForm}
                disabled={saving}
                aria-label="Close employee form"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="alert" role="alert">
                <span>{error}</span>
              </div>
            )}

            <p className="form-intro">
              {editingId
                ? "Update the employee's directory information."
                : "Enter their email address. It will be their username; they will fill in their profile and create a password from the secure invite link."}
            </p>

            <form onSubmit={handleSubmit} className="employee-form">
              <label>
                <span>{editingId ? "Email address" : "Employee email / username"}</span>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="alex@company.com"
                  required
                />
              </label>

              {editingId && (
                <>
                  <label>
                    <span>Full name</span>
                    <input name="name" value={form.name} onChange={handleChange} required maxLength="100" />
                  </label>
                  <label>
                    <span>Department</span>
                    <input name="department" value={form.department} onChange={handleChange} required maxLength="100" />
                  </label>
                  <label>
                    <span>Contact number</span>
                    <input name="contact_number" type="tel" value={form.contact_number} onChange={handleChange} minLength="7" maxLength="25" required />
                  </label>
                  <label>
                    <span>Address</span>
                    <input name="address" value={form.address} onChange={handleChange} maxLength="250" required />
                  </label>
                </>
              )}

              <button className="primary-button" type="submit" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Add and send invite"}
                {!saving && <span aria-hidden="true">→</span>}
              </button>

              <button
                className="cancel-button"
                type="button"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </button>
            </form>
          </aside>
          </div>
        )}

        {documentEmployee && (
          <div
            className="employee-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setDocumentEmployee(null);
              }
            }}
          >
            <section
              className="panel employee-form-modal document-review-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="employee-documents-title"
            >
              <button
                className="employee-modal-close"
                type="button"
                onClick={() => setDocumentEmployee(null)}
                aria-label="Close employee documents"
              >
                ×
              </button>
              <p className="panel-kicker">EMPLOYEE DOCUMENTS</p>
              <h2 id="employee-documents-title">{documentEmployee.name}</h2>
              <p className="document-help-copy">
                ID: {documentEmployee.employee_number} · {documentEmployee.email}
              </p>

              {documentsError && (
                <div className="alert" role="alert">{documentsError}</div>
              )}
              {documentsLoading ? (
                <p className="document-empty-copy">Loading documents…</p>
              ) : employeeDocuments.length === 0 ? (
                <p className="document-empty-copy">
                  This employee has not uploaded any documents.
                </p>
              ) : (
                <ul className="employee-document-list">
                  {employeeDocuments.map((documentFile) => (
                    <li key={documentFile.id}>
                      <div className="employee-document-info">
                        <strong>{documentFile.document_type === "aadhaar" ? "Aadhaar card" : documentFile.filename}</strong>
                        <small>
                          {(documentFile.size_bytes / (1024 * 1024)).toFixed(2)} MB
                          {" · "}
                          {new Date(documentFile.uploaded_at).toLocaleDateString()}
                        </small>
                        {documentFile.ocr_text && (
                          <div className="aadhaar-ocr-result">
                            <strong>OCR text · Aadhaar number masked</strong>
                            <pre>{documentFile.ocr_text}</pre>
                          </div>
                        )}
                      </div>
                      <button
                        className="refresh-button"
                        onClick={() => downloadEmployeeDocument(documentFile)}
                      >
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
