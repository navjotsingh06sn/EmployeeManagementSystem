import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api";
import Brand from "../components/Brand";
import ThemeToggle from "../components/ThemeToggle";
import useAutoRefresh from "../hooks/useAutoRefresh";

const emptyProfile = {
  name: "",
  email: "",
  department: "",
  contact_number: "",
  address: "",
};

const emptyPassword = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

export default function AccountSettings({ role, email, onBack, onLogout, onAccountUpdated }) {
  const [profile, setProfile] = useState(emptyProfile);
  const [password, setPassword] = useState(emptyPassword);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const profileDirtyRef = useRef(false);

  const isAdmin = role === "admin";
  const profileEndpoint = isAdmin ? "/admin/me" : "/employees/me";
  const passwordEndpoint = isAdmin ? "/admin/me/password" : "/employees/me/password";

  const loadProfile = useCallback(async () => {
    try {
      const data = await apiRequest(profileEndpoint);
      if (!profileDirtyRef.current) {
        setProfile({ ...emptyProfile, ...data });
        setError("");
      }
    } catch (err) {
      setError(err.message || "Could not load your account details.");
    } finally {
      setLoading(false);
    }
  }, [profileEndpoint]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useAutoRefresh(loadProfile);

  function updateProfile(event) {
    const { name, value } = event.target;
    profileDirtyRef.current = true;
    setProfile((current) => ({ ...current, [name]: value }));
  }

  function updatePassword(event) {
    const { name, value } = event.target;
    setPassword((current) => ({ ...current, [name]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSavingProfile(true);
    try {
      const updated = await apiRequest(profileEndpoint, {
        method: "PUT",
        body: JSON.stringify({
          name: profile.name.trim(),
          email: profile.email.trim(),
          department: profile.department.trim(),
          contact_number: profile.contact_number.trim(),
          address: profile.address.trim(),
        }),
      });
      setProfile((current) => ({ ...current, ...updated }));
      profileDirtyRef.current = false;
      onAccountUpdated(updated);
      setNotice("Your account details have been updated.");
    } catch (err) {
      setError(err.message || "Could not update your account details.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password.new_password !== password.confirm_password) {
      setError("The new passwords do not match.");
      return;
    }
    if (password.current_password === password.new_password) {
      setError("Choose a new password different from your current one.");
      return;
    }

    setSavingPassword(true);
    try {
      const result = await apiRequest(passwordEndpoint, {
        method: "PUT",
        body: JSON.stringify({
          current_password: password.current_password,
          new_password: password.new_password,
        }),
      });
      setPassword(emptyPassword);
      setNotice(result.message || "Your password has been updated.");
    } catch (err) {
      setError(err.message || "Could not change your password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <ThemeToggle />
          <button className="refresh-button" type="button" onClick={onBack}>Back to dashboard</button>
          <span className="user-badge"><span className="live-dot" /> {email}</span>
          <button className="logout-button" type="button" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="dashboard employee-dashboard account-settings-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">MY WORKSPACE / SETTINGS</p>
            <h1>Account settings</h1>
            <p className="page-description">Update your sign-in details, personal information, and password.</p>
          </div>
          <div className="heading-badge"><span className="live-dot" /> {isAdmin ? "Administrator account" : "Employee account"}</div>
        </section>

        {error && <div className="alert" role="alert">{error}</div>}
        {notice && <div className="success-alert" role="status">{notice}</div>}

        {loading ? (
          <section className="panel settings-loading"><span className="loader" /><p>Loading account settings…</p></section>
        ) : (
          <>
            <section className="panel account-settings-panel">
              <div className="directory-heading">
                <div>
                  <p className="panel-kicker">PROFILE AND LOGIN</p>
                  <h2>Your account details</h2>
                  <p className="page-description">Your email address is also your username for signing in.</p>
                </div>
              </div>
              <form className="settings-profile-form" onSubmit={saveProfile}>
                <label><span>Full name</span><input name="name" value={profile.name} onChange={updateProfile} maxLength="100" required /></label>
                <label><span>Username / email</span><input name="email" type="email" value={profile.email} onChange={updateProfile} autoComplete="email" required /></label>
                <label><span>{isAdmin ? "Team / department" : "Department"}</span><input name="department" value={profile.department} onChange={updateProfile} maxLength="100" required /></label>
                <label><span>Contact number</span><input name="contact_number" type="tel" value={profile.contact_number} onChange={updateProfile} minLength="7" maxLength="25" required /></label>
                <label className="settings-address-field"><span>Address</span><input name="address" value={profile.address} onChange={updateProfile} maxLength="250" required /></label>
                <button className="primary-button" type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save account details"}</button>
              </form>
            </section>

            <section className="panel account-settings-panel">
              <div className="directory-heading">
                <div>
                  <p className="panel-kicker">ACCOUNT SECURITY</p>
                  <h2>Change password</h2>
                  <p className="page-description">Confirm your current password before choosing a new one.</p>
                </div>
              </div>
              <form className="settings-password-form" onSubmit={savePassword}>
                <label><span>Current password</span><input type="password" name="current_password" value={password.current_password} onChange={updatePassword} autoComplete="current-password" required /></label>
                <label><span>New password</span><input type="password" name="new_password" value={password.new_password} onChange={updatePassword} minLength="8" maxLength="128" autoComplete="new-password" required /></label>
                <label><span>Confirm new password</span><input type="password" name="confirm_password" value={password.confirm_password} onChange={updatePassword} minLength="8" maxLength="128" autoComplete="new-password" required /></label>
                <button className="primary-button" type="submit" disabled={savingPassword}>{savingPassword ? "Updating…" : "Update password"}</button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
