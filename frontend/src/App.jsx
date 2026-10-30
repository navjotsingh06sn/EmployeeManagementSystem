import { useEffect, useMemo, useState } from "react";
import { apiRequest, clearToken, saveToken } from "./api";

const emptyForm = { name: "", email: "", department: "", contact_number: "", address: "", password: "" };

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "").join("") || "E";
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="PeopleDesk home">
      <span className="brand-mark">P</span>
      <span className="brand-copy">
        <strong>PeopleDesk</strong>
        <small>Employee workspace</small>
      </span>
    </a>
  );
}

function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", department: "", contact_number: "", address: "", password: "" });
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      });
      saveToken(result.access_token);
      onLogin(result);
    } catch (err) {
      setError(err.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  function updateRegistration(event) {
    const { name, value } = event.target;
    setRegisterForm((current) => ({ ...current, [name]: value }));
  }

  async function submitRegistration(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...registerForm,
          name: registerForm.name.trim(),
          email: registerForm.email.trim(),
          department: registerForm.department.trim(),
        }),
      });
      setNotice(result.message);
      setEmail(registerForm.email);
      setPassword("");
      setRegisterForm({ name: "", email: "", department: "", contact_number: "", address: "", password: "" });
      setRole("employee");
      setRegistering(false);
    } catch (err) {
      setError(err.message || "Could not submit your registration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand"><Brand /></div>
      <main className="login-layout">
        <section className="login-welcome">
          <p className="eyebrow">EMPLOYEE MANAGEMENT</p>
          <h1>Your team,<br />in one place.</h1>
          <p className="welcome-copy">A simple, secure workspace to manage employee information.</p>
          <div className="welcome-points">
            <span><b>✓</b> Role-based access</span>
            <span><b>✓</b> Private employee profiles</span>
            <span><b>✓</b> Admin-approved registration</span>
          </div>
          <div className="welcome-decoration">
            <span className="deco-orbit orbit-one" />
            <span className="deco-orbit orbit-two" />
            <span className="deco-card card-one">People <strong>01</strong></span>
            <span className="deco-card card-two">Departments <strong>02</strong></span>
            <span className="deco-dot" />
          </div>
        </section>

        <section className="login-card">
          <div className="login-card-heading">
            <p className="panel-kicker">{registering ? "EMPLOYEE REGISTRATION" : "WELCOME BACK"}</p>
            <h2>{registering ? "Request an account" : "Sign in to continue"}</h2>
            <p>{registering
              ? "Create your employee profile. An administrator must approve it before you can sign in."
              : "Choose your account type and enter your credentials."}</p>
          </div>

          {!registering && (
            <div className="login-role-tabs" role="tablist" aria-label="Account type">
              <button type="button" className={role === "admin" ? "active" : ""}
                onClick={() => { setRole("admin"); setError(""); setNotice(""); }}>
                <span className="tab-symbol">A</span> Administrator
              </button>
              <button type="button" className={role === "employee" ? "active" : ""}
                onClick={() => { setRole("employee"); setError(""); setNotice(""); }}>
                <span className="tab-symbol">E</span> Employee
              </button>
            </div>
          )}

          {notice && <div className="success-alert" role="status">{notice}</div>}
          {error && <div className="alert login-alert" role="alert">{error}</div>}

          {registering ? (
            <form className="login-form" onSubmit={submitRegistration}>
              <label><span>Full name</span>
                <input name="name" value={registerForm.name} onChange={updateRegistration}
                  placeholder="Your name" maxLength="100" required />
              </label>
              <label><span>Email address</span>
                <input name="email" type="email" value={registerForm.email}
                  onChange={updateRegistration} placeholder="you@company.com" autoComplete="email" required />
              </label>
              <label><span>Department</span>
                <input name="department" value={registerForm.department}
                  onChange={updateRegistration} placeholder="e.g. Engineering" maxLength="100" required />
              </label>
              <label><span>Contact number</span>
                <input name="contact_number" type="tel" value={registerForm.contact_number}
                  onChange={updateRegistration} placeholder="+1 555 123 4567" minLength="7" maxLength="25" required />
              </label>
              <label><span>Address</span>
                <input name="address" value={registerForm.address} onChange={updateRegistration}
                  placeholder="Street, city, postal code" maxLength="250" required />
              </label>
              <label><span>Create password</span>
                <input name="password" type="password" value={registerForm.password}
                  onChange={updateRegistration} placeholder="At least 8 characters"
                  minLength="8" maxLength="128" autoComplete="new-password" required />
              </label>
              <button className="primary-button login-submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit for approval"}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={submit}>
              <label><span>Email address</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com" autoComplete="username" required />
              </label>
              <label><span>Password</span>
                <div className="password-field">
                  <input type={showPassword ? "text" : "password"} value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password" autoComplete="current-password" required />
                  <button className="reveal-button" type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <button className="primary-button login-submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>
          )}

          <div className="register-prompt">
            {registering ? (
              <span>Already registered? <button type="button" onClick={() => {
                setRegistering(false); setError(""); setNotice("");
              }}>Back to sign in</button></span>
            ) : (
              <span>New employee? <button type="button" onClick={() => {
                setRegistering(true); setError(""); setNotice("");
              }}>Request an account</button></span>
            )}
          </div>
          {!registering && (
            <p className="login-footnote">
              {role === "admin"
                ? "Administrator credentials are configured by the application owner."
                : "Pending employee registrations must be approved by an administrator."}
            </p>
          )}
        </section>
      </main>
      <footer className="login-footer">PeopleDesk <span>•</span> Employee workspace</footer>
    </div>
  );
}

function EmployeePortal({ email, onLogout, onProfileUpdated }) {
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [changingPassword, setChangingPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", department: "", contact_number: "", address: "" });

  useEffect(() => {
    apiRequest("/employees/me")
      .then(setEmployee)
      .catch((err) => setError(err.message || "Could not load your profile."))
      .finally(() => setLoading(false));
  }, []);

  function beginEdit() {
    setForm({ name: employee.name, email: employee.email, department: employee.department, contact_number: employee.contact_number || "", address: employee.address || "" });
    setEditing(true);
    setError("");
    setNotice("");
  }

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const updated = await apiRequest("/employees/me", {
        method: "PUT",
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          department: form.department.trim(),
          contact_number: form.contact_number.trim(),
          address: form.address.trim(),
        }),
      });
      setEmployee(updated);
      setEditing(false);
      setNotice("Your profile was updated.");
      onProfileUpdated(updated);
    } catch (err) {
      setError(err.message || "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }

  function updatePasswordForm(event) {
    const { name, value } = event.target;
    setPasswordForm((current) => ({ ...current, [name]: value }));
  }

  async function changePassword(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError("The new passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      const result = await apiRequest("/employees/me/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: passwordForm.current_password,
          new_password: passwordForm.new_password,
        }),
      });
      setNotice(result.message);
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err) {
      setError(err.message || "Could not change your password.");
    } finally {
      setChangingPassword(false);
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="user-badge"><span className="live-dot" /> Employee portal</span>
          <button className="logout-button" onClick={onLogout}>Sign out</button>
        </div>
      </header>
      <main className="dashboard employee-dashboard">
        <section className="page-heading">
          <div>
            <p className="eyebrow">MY WORKSPACE / PROFILE</p>
            <h1>Welcome{employee ? ", " + employee.name.split(" ")[0] : ""}</h1>
            <p className="page-description">View and update your employee information.</p>
          </div>
          <div className="heading-badge"><span className="live-dot" /> Signed in as {email}</div>
        </section>

        {error && <div className="alert" role="alert">{error}</div>}
        {notice && <div className="success-alert" role="status">{notice}</div>}
        {loading ? (
          <section className="panel profile-loading"><span className="loader" /><strong>Loading your profile…</strong></section>
        ) : employee ? (
          <>
            <section className="summary-grid employee-summary">
              <article className="summary-card">
                <span className="avatar profile-avatar">{initials(employee.name)}</span>
                <div><p>Employee</p><strong>{employee.name}</strong></div>
                <span className="summary-caption">Your account</span>
              </article>
              <article className="summary-card">
                <div className="summary-icon department-icon">D</div>
                <div><p>Department</p><strong className="department-value">{employee.department}</strong></div>
                <span className="summary-caption">Your team</span>
              </article>
            </section>
            <section className="panel profile-panel">
              <div className="directory-heading">
                <div><p className="panel-kicker">PERSONAL DETAILS</p><h2>My employee profile</h2></div>
                {!editing && <button className="refresh-button" onClick={beginEdit}>Edit my details</button>}
              </div>
              {editing ? (
                <form className="employee-form profile-edit-form" onSubmit={saveProfile}>
                  <label><span>Full name</span>
                    <input name="name" value={form.name} onChange={updateForm} maxLength="100" required />
                  </label>
                  <label><span>Email address</span>
                    <input name="email" type="email" value={form.email} onChange={updateForm} required />
                  </label>
                  <label><span>Department</span>
                    <input name="department" value={form.department} onChange={updateForm} maxLength="100" required />
                  </label>
                  <label><span>Contact number</span>
                    <input name="contact_number" type="tel" value={form.contact_number} onChange={updateForm}
                      minLength="7" maxLength="25" required />
                  </label>
                  <label><span>Address</span>
                    <input name="address" value={form.address} onChange={updateForm}
                      maxLength="250" required />
                  </label>
                  <div className="profile-edit-actions">
                    <button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
                    <button className="cancel-button" type="button"
                      onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="profile-fields">
                  <div className="profile-field"><span>Full name</span><strong>{employee.name}</strong></div>
                  <div className="profile-field"><span>Email address</span><strong>{employee.email}</strong></div>
                  <div className="profile-field"><span>Department</span><strong>{employee.department}</strong></div>
                  <div className="profile-field"><span>Contact number</span><strong>{employee.contact_number || "Not provided"}</strong></div>
                  <div className="profile-field"><span>Address</span><strong>{employee.address || "Not provided"}</strong></div>
                </div>
              )}
            </section>
            <section className="panel password-panel">
              <div className="directory-heading">
                <div><p className="panel-kicker">ACCOUNT SECURITY</p><h2>Change password</h2></div>
              </div>
              <form className="password-change-form" onSubmit={changePassword}>
                <label><span>Current password</span>
                  <input type="password" name="current_password" value={passwordForm.current_password}
                    onChange={updatePasswordForm} autoComplete="current-password" required />
                </label>
                <label><span>New password</span>
                  <input type="password" name="new_password" value={passwordForm.new_password}
                    onChange={updatePasswordForm} minLength="8" maxLength="128"
                    autoComplete="new-password" required />
                </label>
                <label><span>Confirm new password</span>
                  <input type="password" name="confirm_password" value={passwordForm.confirm_password}
                    onChange={updatePasswordForm} minLength="8" maxLength="128"
                    autoComplete="new-password" required />
                </label>
                <button className="primary-button" disabled={changingPassword}>
                  {changingPassword ? "Updating…" : "Update password"}
                </button>
              </form>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function AdminDashboard({ email, onLogout }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState(false);

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

  useEffect(() => { loadEmployees(); }, []);

  const departmentCount = useMemo(
    () => new Set(employees.map((employee) => employee.department)).size,
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.email, employee.department]
        .some((value) => value.toLowerCase().includes(term))
    );
  }, [employees, search]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const employee = {
      name: form.name.trim(),
      email: form.email.trim(),
      department: form.department.trim(),
      contact_number: form.contact_number.trim(),
      address: form.address.trim(),
    };

    try {
      if (editingId) {
        await apiRequest("/employees/" + editingId, {
          method: "PUT",
          body: JSON.stringify(employee),
        });
      } else {
        await apiRequest("/employees", {
          method: "POST",
          body: JSON.stringify({ ...employee, password: form.password }),
        });
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
    setForm({
      name: employee.name,
      email: employee.email,
      department: employee.department,
      contact_number: employee.contact_number || "",
      address: employee.address || "",
      password: "",
    });
    setError("");
  }

  async function approveEmployee(employee) {
    setError("");
    try {
      await apiRequest("/employees/" + employee.id + "/approve", { method: "POST" });
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Could not approve registration.");
    }
  }

  async function setEmployeePassword(employee) {
    const password = window.prompt(
      "Set a password for " + employee.name + " (at least 8 characters):"
    );
    if (password === null) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setError("");
    try {
      await apiRequest("/employees/" + employee.id + "/account", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Could not set the employee password.");
    }
  }

  async function deleteEmployee(employee) {
    if (!window.confirm("Delete " + employee.name + "'s employee record and login?")) return;
    setError("");
    try {
      await apiRequest("/employees/" + employee.id, { method: "DELETE" });
      await loadEmployees();
    } catch (err) {
      setError(err.message || "Could not delete employee.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className="user-badge"><span className="live-dot" /> Admin · {email}</span>
          <a className="docs-link" href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">
            API docs <span className="docs-icon">↗</span>
          </a>
          <button className="logout-button" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="dashboard">
        <section className="page-heading">
          <div>
            <p className="eyebrow">ADMINISTRATION / DIRECTORY</p>
            <h1>Employee directory</h1>
            <p className="page-description">Manage employee records and login access.</p>
          </div>
          <div className="heading-badge"><span className="live-dot" /> Administrator view</div>
        </section>

        {error && (
          <div className="alert" role="alert">
            <span className="alert-symbol">!</span><span>{error}</span>
            <button className="alert-close" onClick={() => setError("")} aria-label="Dismiss error">×</button>
          </div>
        )}

        <section className="summary-grid" aria-label="Employee summary">
          <article className="summary-card">
            <div className="summary-icon people-icon">P</div>
            <div><p>Total employees</p><strong>{employees.length}</strong></div>
            <span className="summary-caption">In your directory</span>
          </article>
          <article className="summary-card">
            <div className="summary-icon department-icon">D</div>
            <div><p>Departments</p><strong>{departmentCount}</strong></div>
            <span className="summary-caption">Across your team</span>
          </article>
          <article className="summary-note">
            <div className="note-mark">✓</div>
            <div><strong>Manage your workforce</strong><p>Admins can view, update, and remove all employee records.</p></div>
          </article>
        </section>

        <section className="workspace-grid">
          <aside className="panel form-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">{editingId ? "UPDATE RECORD" : "NEW RECORD"}</p>
                <h2>{editingId ? "Edit employee" : "Add an employee"}</h2>
              </div>
              <span className="panel-icon">{editingId ? "✎" : "+"}</span>
            </div>
            <p className="form-intro">
              {editingId
                ? "Update the employee's directory information."
                : "Add their details and create an employee login."}
            </p>

            <form onSubmit={handleSubmit} className="employee-form">
              <label><span>Full name</span>
                <input name="name" value={form.name} onChange={handleChange}
                  placeholder="e.g. Alex Morgan" required maxLength="100" />
              </label>
              <label><span>Email address</span>
                <input name="email" type="email" value={form.email} onChange={handleChange}
                  placeholder="alex@company.com" required />
              </label>
              <label><span>Department</span>
                <input name="department" value={form.department} onChange={handleChange}
                  placeholder="e.g. Engineering" required maxLength="100" />
              </label>
              <label><span>Contact number</span>
                <input name="contact_number" type="tel" value={form.contact_number} onChange={handleChange}
                  placeholder="+1 555 123 4567" minLength="7" maxLength="25" required />
              </label>
              <label><span>Address</span>
                <input name="address" value={form.address} onChange={handleChange}
                  placeholder="Street, city, postal code" maxLength="250" required />
              </label>
              {!editingId && (
                <label><span>Temporary password</span>
                  <div className="password-field">
                    <input name="password" type={showTempPassword ? "text" : "password"}
                      value={form.password} onChange={handleChange}
                      placeholder="At least 8 characters" minLength="8" maxLength="128" required />
                    <button className="reveal-button" type="button"
                      onClick={() => setShowTempPassword((visible) => !visible)}
                      aria-label={showTempPassword ? "Hide temporary password" : "Show temporary password"}>
                      {showTempPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>
              )}
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Add employee"}
                {!saving && <span aria-hidden="true">→</span>}
              </button>
              {editingId && <button className="cancel-button" type="button" onClick={resetForm}>Cancel editing</button>}
            </form>
          </aside>

          <section className="panel directory-panel">
            <div className="directory-heading">
              <div><p className="panel-kicker">YOUR ORGANIZATION</p>
                <h2>All employees <span className="count-pill">{employees.length}</span></h2></div>
              <button className="refresh-button" onClick={loadEmployees} disabled={loading}>
                <span>↻</span> Refresh
              </button>
            </div>

            <div className="directory-toolbar">
              <label className="search-box">
                <span className="search-icon" aria-hidden="true">⌕</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, email, or department" aria-label="Search employees" />
              </label>
              <span className="results-label">{filteredEmployees.length} {filteredEmployees.length === 1 ? "result" : "results"}</span>
            </div>

            {loading ? (
              <div className="empty-state"><span className="loader" /><strong>Loading employees</strong><p>Getting the latest directory records.</p></div>
            ) : filteredEmployees.length === 0 ? (
              <div className="empty-state"><span className="empty-icon">{search ? "⌕" : "P"}</span>
                <strong>{search ? "No matches found" : "No employees yet"}</strong>
                <p>{search ? "Try another name, email, or department." : "Add your first employee using the form."}</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Employee</th><th>Department</th><th>Account status</th><th className="actions-heading">Actions</th></tr></thead>
                  <tbody>
                    {filteredEmployees.map((employee) => (
                      <tr key={employee.id}>
                        <td><div className="employee-cell"><span className="avatar">{initials(employee.name)}</span>
                          <span className="employee-details"><strong>{employee.name}</strong><small>{employee.email}</small></span></div></td>
                        <td><span className="department-pill">{employee.department}</span></td>
                        <td><span className={"account-status " + (employee.account_status === "approved" ? "active-status" : employee.account_status === "pending" ? "pending-status" : "")}>
                          <span />{employee.account_status === "pending" ? "Pending approval" : employee.account_status === "approved" ? "Approved" : "No login"}
                        </span></td>
                        <td><div className="row-actions">
                          {employee.account_status === "pending" && (
                            <button className="action-button approve-action" onClick={() => approveEmployee(employee)}>Approve</button>
                          )}
                          <button className="action-button edit-action" onClick={() => startEditing(employee)}>Edit</button>
                          {employee.account_status !== "pending" && (
                            <button className="action-button account-action" onClick={() => setEmployeePassword(employee)}>
                              {employee.has_account ? "Reset login" : "Set login"}
                            </button>
                          )}
                          <button className="action-button delete-action" onClick={() => deleteEmployee(employee)}>Delete</button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="panel-footer">Employee records and login access are managed from this administrator account.</div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("employee_management_token"));
  const [account, setAccount] = useState(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setCheckingSession(false);
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
  }, [token]);

  function onLogin(result) {
    setToken(result.access_token);
    setAccount({ email: result.email, role: result.role });
    setCheckingSession(false);
  }

  function onLogout() {
    clearToken();
    setToken(null);
    setAccount(null);
  }

  if (checkingSession) {
    return <div className="session-check"><span className="loader" /><strong>Checking your session…</strong></div>;
  }
  if (!token || !account) return <LoginScreen onLogin={onLogin} />;
  if (account.role === "employee") return <EmployeePortal email={account.email} onLogout={onLogout} onProfileUpdated={(updated) => setAccount((current) => ({ ...current, email: updated.email }))} />;
  return <AdminDashboard email={account.email} onLogout={onLogout} />;
}






