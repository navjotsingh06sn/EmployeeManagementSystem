import { useState } from "react";
import { apiRequest } from "../api";
import Brand from "../components/Brand";

export default function AcceptInvite({ token }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);

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
        body: JSON.stringify({ token, password }),
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
          <h1>Set up your account.</h1>
          <p className="welcome-copy">
            Create a password to access your PeopleDesk employee workspace.
          </p>
        </section>
        <section className="login-card">
          <div className="login-card-heading">
            <p className="panel-kicker">EMPLOYEE INVITATION</p>
            <h2>{complete ? "Account ready" : "Choose your password"}</h2>
            <p>
              {complete
                ? "Your email address is your username. You can now sign in."
                : "Use the email address where you received this invitation as your username."}
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
                {busy ? "Setting up…" : "Set password"}
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
