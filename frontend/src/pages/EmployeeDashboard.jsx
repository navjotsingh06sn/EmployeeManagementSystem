import { useEffect, useState } from "react";
import { apiRequest, downloadFile, uploadFile } from "../api";
import Brand from "../components/Brand";
import { initials } from "../components/helpers";

export default function EmployeePortal({ email, onLogout, onProfileUpdated }) {
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentError, setDocumentError] = useState("");
  const [documentNotice, setDocumentNotice] = useState("");
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    department: "",
    contact_number: "",
    address: "",
  });

  useEffect(() => {
    apiRequest("/employees/me")
      .then(setEmployee)
      .catch((err) => setError(err.message || "Could not load your profile."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    apiRequest("/employees/me/documents")
      .then(setDocuments)
      .catch((err) =>
        setDocumentError(err.message || "Could not load your documents.")
      )
      .finally(() => setDocumentsLoading(false));
  }, []);

  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setDocumentError("");
    setDocumentNotice("");
    setUploadingDocument(true);
    try {
      const uploaded = await uploadFile("/employees/me/documents", file);
      setDocuments((current) => [uploaded, ...current]);
      setDocumentNotice("Aadhaar card uploaded. OCR text is ready for administrator review.");
    } catch (err) {
      setDocumentError(err.message || "Could not upload this document.");
    } finally {
      setUploadingDocument(false);
      event.target.value = "";
    }
  }

  async function downloadDocument(documentFile) {
    setDocumentError("");
    try {
      await downloadFile(
        `/employees/me/documents/${documentFile.id}`,
        documentFile.filename
      );
    } catch (err) {
      setDocumentError(err.message || "Could not download this document.");
    }
  }

  async function deleteDocument(documentFile) {
    if (!window.confirm(`Delete ${documentFile.filename}?`)) return;

    setDocumentError("");
    setDocumentNotice("");
    setBusyDocumentId(documentFile.id);
    try {
      await apiRequest(`/employees/me/documents/${documentFile.id}`, {
        method: "DELETE",
      });
      setDocuments((current) =>
        current.filter((item) => item.id !== documentFile.id)
      );
      setDocumentNotice("Document deleted.");
    } catch (err) {
      setDocumentError(err.message || "Could not delete this document.");
    } finally {
      setBusyDocumentId(null);
    }
  }

  function beginEdit() {
    setForm({
      name: employee.name,
      email: employee.email,
      department: employee.department,
      contact_number: employee.contact_number || "",
      address: employee.address || "",
    });
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
      setPasswordForm({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
      setPasswordFormOpen(false);
      setShowPasswords(false);
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
          <span className="user-badge">
            <span className="live-dot" /> Employee portal
          </span>
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
              View and update your employee information.
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
        {notice && (
          <div className="success-alert" role="status">
            {notice}
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
                {!editing && (
                  <button className="refresh-button" onClick={beginEdit}>
                    Edit my details
                  </button>
                )}
              </div>

              {editing ? (
                <form
                  className="employee-form profile-edit-form"
                  onSubmit={saveProfile}
                >
                  <label>
                    <span>Full name</span>
                    <input
                      name="name"
                      value={form.name}
                      onChange={updateForm}
                      maxLength="100"
                      required
                    />
                  </label>

                  <label>
                    <span>Email address</span>
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={updateForm}
                      required
                    />
                  </label>

                  <label>
                    <span>Department</span>
                    <input
                      name="department"
                      value={form.department}
                      onChange={updateForm}
                      maxLength="100"
                      required
                    />
                  </label>

                  <label>
                    <span>Contact number</span>
                    <input
                      name="contact_number"
                      type="tel"
                      value={form.contact_number}
                      onChange={updateForm}
                      minLength="7"
                      maxLength="25"
                      required
                    />
                  </label>

                  <label>
                    <span>Address</span>
                    <input
                      name="address"
                      value={form.address}
                      onChange={updateForm}
                      maxLength="250"
                      required
                    />
                  </label>

                  <div className="profile-edit-actions">
                    <button className="primary-button" disabled={saving}>
                      {saving ? "Saving…" : "Save profile"}
                    </button>
                    <button
                      className="cancel-button"
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setError("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="profile-fields">
                  <div className="profile-field">
                    <span>Full name</span>
                    <strong>{employee.name}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Email address</span>
                    <strong>{employee.email}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Department</span>
                    <strong>{employee.department}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Contact number</span>
                    <strong>{employee.contact_number || "Not provided"}</strong>
                  </div>
                  <div className="profile-field">
                    <span>Address</span>
                    <strong>{employee.address || "Not provided"}</strong>
                  </div>
                </div>
              )}
            </section>

            <section className="panel document-panel">
              <div className="directory-heading">
                <div>
                  <p className="panel-kicker">EMPLOYEE DOCUMENTS</p>
                  <h2>My documents</h2>
                  <p className="document-help-copy">
                    Upload one Aadhaar card image only (JPG or PNG, up to 10 MB).
                    Your administrator can review it and see the OCR text with the Aadhaar number masked.
                  </p>
                </div>
                <label className="document-upload-button">
                  <span>{uploadingDocument ? "Uploading…" : documents.some((item) => item.document_type === "aadhaar") ? "Aadhaar uploaded" : "Upload Aadhaar"}</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    onChange={uploadDocument}
                    disabled={uploadingDocument || documents.some((item) => item.document_type === "aadhaar")}
                  />
                </label>
              </div>

              {documentError && (
                <div className="alert" role="alert">{documentError}</div>
              )}
              {documentNotice && (
                <div className="success-alert" role="status">
                  {documentNotice}
                </div>
              )}

              {documentsLoading ? (
                <p className="document-empty-copy">Loading documents…</p>
              ) : documents.length === 0 ? (
                <p className="document-empty-copy">
                  No Aadhaar card uploaded yet.
                </p>
              ) : (
                <ul className="employee-document-list">
                  {documents.map((documentFile) => (
                    <li key={documentFile.id}>
                      <div className="employee-document-info">
                        <strong>{documentFile.document_type === "aadhaar" ? "Aadhaar card" : documentFile.filename}</strong>
                        <small>
                          {(documentFile.size_bytes / (1024 * 1024)).toFixed(2)} MB
                          {" · "}
                          {new Date(documentFile.uploaded_at).toLocaleDateString()}
                        </small>
                      </div>
                      <div className="employee-document-actions">
                        <button
                          className="refresh-button"
                          onClick={() => downloadDocument(documentFile)}
                        >
                          Download
                        </button>
                        <button
                          className="delete-button"
                          onClick={() => deleteDocument(documentFile)}
                          disabled={busyDocumentId === documentFile.id}
                        >
                          {busyDocumentId === documentFile.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel password-panel">
              <div className="directory-heading">
                <div>
                  <p className="panel-kicker">ACCOUNT SECURITY</p>
                  <h2>Change password</h2>
                </div>
                <button
                  className="refresh-button"
                  type="button"
                  onClick={() => {
                    setPasswordFormOpen((open) => !open);
                    setPasswordForm({
                      current_password: "",
                      new_password: "",
                      confirm_password: "",
                    });
                    setShowPasswords(false);
                  }}
                >
                  {passwordFormOpen ? "Cancel" : "Change password"}
                </button>
              </div>

              {passwordFormOpen && (
                <form className="password-change-form" onSubmit={changePassword}>
                  <button
                    className="refresh-button"
                    type="button"
                    onClick={() => setShowPasswords((visible) => !visible)}
                  >
                    {showPasswords ? "Hide passwords" : "Show passwords"}
                  </button>
                <label>
                  <span>Current password</span>
                  <input
                    type={showPasswords ? "text" : "password"}
                    name="current_password"
                    value={passwordForm.current_password}
                    onChange={updatePasswordForm}
                    autoComplete="current-password"
                    required
                  />
                </label>

                <label>
                  <span>New password</span>
                  <input
                    type={showPasswords ? "text" : "password"}
                    name="new_password"
                    value={passwordForm.new_password}
                    onChange={updatePasswordForm}
                    minLength="8"
                    maxLength="128"
                    autoComplete="new-password"
                    required
                  />
                </label>

                <label>
                  <span>Confirm new password</span>
                  <input
                    type={showPasswords ? "text" : "password"}
                    name="confirm_password"
                    value={passwordForm.confirm_password}
                    onChange={updatePasswordForm}
                    minLength="8"
                    maxLength="128"
                    autoComplete="new-password"
                    required
                  />
                </label>

                <button className="primary-button" disabled={changingPassword}>
                  {changingPassword ? "Updating…" : "Update password"}
                </button>
                </form>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
