import { useState } from "react";
import { apiRequest, saveToken } from "../api";
import Brand from "../components/Brand";

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    department: "",
    contact_number: "",
    address: "",
    password: "",
  });
  const [registering, setRegistering] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
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
        body: JSON.stringify({ email, password }),
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
      setRegisterForm({
        name: "",
        email: "",
        department: "",
        contact_number: "",
        address: "",
        password: "",
      });
      setRegistering(false);
    } catch (err) {
      setError(err.message || "Could not submit your registration.");
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
          <h1>
            Your team,
            <br />
            in one place.
          </h1>
          <p className="welcome-copy">
            A simple, secure workspace to manage employee information.
          </p>

          <div className="welcome-points">
            <span>
              <b>✓</b> Role-based access
            </span>
            <span>
              <b>✓</b> Private employee profiles
            </span>
            <span>
              <b>✓</b> Admin-approved registration
            </span>
          </div>

          <div className="welcome-decoration">
            <span className="deco-orbit orbit-one" />
            <span className="deco-orbit orbit-two" />
            <span className="deco-card card-one">
              People <strong>01</strong>
            </span>
            <span className="deco-card card-two">
              Departments <strong>02</strong>
            </span>
            <span className="deco-dot" />
          </div>
        </section>

        <section className="login-card">
          <div className="login-card-heading">
            <p className="panel-kicker">
              {registering ? "EMPLOYEE REGISTRATION" : "WELCOME BACK"}
            </p>
            <h2>{registering ? "Request an account" : "Sign in to continue"}</h2>
            <p>
              {registering
                ? "Create your employee profile. An administrator must approve it before you can sign in."
                : "Enter your email address and password to continue."}
            </p>
          </div>

          <div className="auth-mode-tabs" role="tablist" aria-label="Account access">
            <button
              type="button"
              role="tab"
              aria-selected={!registering}
              className={!registering ? "active" : ""}
              onClick={() => {
                setRegistering(false);
                setShowForgotHelp(false);
                setError("");
                setNotice("");
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={registering}
              className={registering ? "active" : ""}
              onClick={() => {
                setRegistering(true);
                setShowForgotHelp(false);
                setError("");
                setNotice("");
              }}
            >
              Sign up
            </button>
          </div>

          {notice && (
            <div className="success-alert" role="status">
              {notice}
            </div>
          )}

          {error && (
            <div className="alert login-alert" role="alert">
              {error}
            </div>
          )}

          {registering ? (
            <form className="login-form" onSubmit={submitRegistration}>
              <label>
                <span>Full name</span>
                <input
                  name="name"
                  value={registerForm.name}
                  onChange={updateRegistration}
                  placeholder="Your name"
                  maxLength="100"
                  required
                />
              </label>

              <label>
                <span>Email address</span>
                <input
                  name="email"
                  type="email"
                  value={registerForm.email}
                  onChange={updateRegistration}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                <span>Department</span>
                <input
                  name="department"
                  value={registerForm.department}
                  onChange={updateRegistration}
                  placeholder="e.g. Engineering"
                  maxLength="100"
                  required
                />
              </label>

              <label>
                <span>Contact number</span>
                <input
                  name="contact_number"
                  type="tel"
                  value={registerForm.contact_number}
                  onChange={updateRegistration}
                  placeholder="+1 555 123 4567"
                  minLength="7"
                  maxLength="25"
                  required
                />
              </label>

              <label>
                <span>Address</span>
                <input
                  name="address"
                  value={registerForm.address}
                  onChange={updateRegistration}
                  placeholder="Street, city, postal code"
                  maxLength="250"
                  required
                />
              </label>

              <label>
                <span>Create password</span>
                <input
                  name="password"
                  type="password"
                  value={registerForm.password}
                  onChange={updateRegistration}
                  placeholder="At least 8 characters"
                  minLength="8"
                  maxLength="128"
                  autoComplete="new-password"
                  required
                />
              </label>

              <button className="primary-button login-submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit for approval"}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>
          ) : (
            <form className="login-form" onSubmit={submit}>
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  name="login-email"
                  autoComplete="off"
                  required
                />
              </label>

              <label>
                <div className="login-password-label">
                  <span>Password</span>
                  <button
                    className="forgot-password-link"
                    type="button"
                    onClick={() => setShowForgotHelp((visible) => !visible)}
                  >
                    {showForgotHelp ? "Hide help" : "Forgot password?"}
                  </button>
                </div>
                <div className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    name="login-password"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    className="reveal-button"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              {showForgotHelp && (
                <div className="forgot-password-help" role="status">
                  <strong>Need help signing in?</strong>
                  <p>
                    Password resets are handled by your administrator. Ask them
                    to reset your employee login. For an admin account, contact
                    the application owner.
                  </p>
                </div>
              )}

              <button className="primary-button login-submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
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
