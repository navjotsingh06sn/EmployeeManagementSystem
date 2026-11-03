import { useState } from "react";
import { apiRequest } from "../api";
import Brand from "../components/Brand";

export default function AcceptInvite({ token }) {
  const [profile, setProfile] = useState({
    name: "",
    department: "",
    contact_number: "",
    address: "",
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

  function handleProfileChange(event) {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = await apiRequest("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({
          token,
          ...profile,
          name: profile.name.trim(),
          department: profile.department.trim(),
          contact_number: profile.contact_number.trim(),
          address: profile.address.trim(),
          password,
        }),
      });
      setComplete(true);
      window.history.replaceState({}, "", "/login");
      setError(result.message);
    } catch (err) {
      setError(err.message || "Could not set up your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <Brand />
      </div>
      <main className="login-layout">
        <section className="login-welcome">
          <p className="eyebrow">EMPLOYEE MANAGEMENT</p>
          <h1>Complete your employee profile.</h1>
          <p className="welcome-copy">
            Enter your details and create a password to activate your PeopleDesk account.
          </p>
        </section>
        <section className="login-card">
          <div className="login-card-heading">
            <p className="panel-kicker">EMPLOYEE INVITATION</p>
            <h2>{complete ? "Account ready" : "Your account setup"}</h2>
            <p>
              {complete
                ? "Your email address is your username. You can now sign in."
                : "Fill in your profile, then create and confirm a password. The email where you received this invitation will be your username."}
            </p>
          </div>

          {error && (
            <div
              className={complete ? "success-alert" : "alert login-alert"}
              role={complete ? "status" : "alert"}
            >
              {error}
            </div>
          )}

          {complete ? (
            <button
              className="primary-button login-submit"
              type="button"
              onClick={() => window.location.reload()}
            >
              Go to sign in <span aria-hidden="true">→</span>
            </button>
          ) : (
            <form className="login-form" onSubmit={submit}>
              <label>
                <span>Full name</span>
                <input
                  name="name"
                  value={profile.name}
                  onChange={handleProfileChange}
                  autoComplete="name"
                  maxLength="100"
                  required
                />
              </label>
              <label>
                <span>Department</span>
                <input
                  name="department"
                  value={profile.department}
                  onChange={handleProfileChange}
                  maxLength="100"
                  required
                />
              </label>
              <label>
                <span>Contact number</span>
                <input
                  name="contact_number"
                  type="tel"
                  value={profile.contact_number}
                  onChange={handleProfileChange}
                  autoComplete="tel"
                  minLength="7"
                  maxLength="25"
                  required
                />
              </label>
              <label>
                <span>Address</span>
                <input
                  name="address"
                  value={profile.address}
                  onChange={handleProfileChange}
                  autoComplete="street-address"
                  maxLength="250"
                  required
                />
              </label>
              <label>
                <span>Create password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength="8"
                  maxLength="128"
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                <span>Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength="8"
                  maxLength="128"
                  autoComplete="new-password"
                  required
                />
              </label>
              <button className="primary-button login-submit" disabled={busy}>
                {busy ? "Setting up…" : "Complete setup"}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>
          )}
        </section>
      </main>
      <footer className="login-footer">
        PeopleDesk <span>•</span> Employee workspace
      </footer>
    </div>
  );
}
