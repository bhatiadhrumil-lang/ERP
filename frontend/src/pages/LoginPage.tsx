import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FlaskConical, KeyRound, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import { Button } from '../components/ui/Button';
import { Field, Input, PasswordInput } from '../components/ui/Field';

const isDevBuild = import.meta.env.DEV;

/**
 * Sign-in page.
 *
 * Two extra flows live here:
 *  - NEW_PASSWORD_REQUIRED: invited employees set their password on first
 *    login ("Set your new password" form), then land on the dashboard.
 *  - First-admin setup: a "Sign up" button always leads to /signup, where a
 *    new deployment can create its first ADMIN account (backend-enforced
 *    one-time bootstrap). "Forgot password?" leads to the password reset flow.
 */
export function LoginPage() {
  const { isAuthenticated, login, devLogin, completeNewPassword, authError } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'credentials' | 'new-password'>('credentials');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Dev-mode sign-in (demo without AWS) — collapsed until toggled.
  const [devOpen, setDevOpen] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devPassword, setDevPassword] = useState('');

  const state = location.state as { verified?: boolean; passwordReset?: boolean } | null;
  const verifiedNotice = state?.verified;
  const passwordResetNotice = state?.passwordReset;

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  function validateCredentials(): string | null {
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (!password) return 'Password is required.';
    return null;
  }

  function validateNewPassword(): string | null {
    if (!newPassword) return 'New password is required.';
    if (newPassword.length < 8) return 'Password must be at least 8 characters.';
    if (newPassword !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === 'credentials') {
      const invalid = validateCredentials();
      if (invalid) {
        setValidationError(invalid);
        return;
      }
      setValidationError(null);
      setLoading(true);
      try {
        const result = await login(email.trim(), password);
        if (result.ok) {
          toast.success('Signed in');
          return; // login navigates to /dashboard
        }
        if (result.nextStep === 'NEW_PASSWORD_REQUIRED') {
          setStep('new-password');
          setPassword('');
          setValidationError(null);
          return;
        }
      } catch (err) {
        toast.error(apiErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    // NEW_PASSWORD_REQUIRED: complete the Cognito challenge.
    const invalid = validateNewPassword();
    if (invalid) {
      setValidationError(invalid);
      return;
    }
    setValidationError(null);
    setLoading(true);
    try {
      const ok = await completeNewPassword(newPassword);
      if (ok) {
        toast.success('Password set — welcome!');
        return; // completeNewPassword navigates to /dashboard
      }
      setStep('credentials');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onDevSubmit(e: FormEvent) {
    e.preventDefault();
    if (!devEmail.trim()) {
      setValidationError('Dev email is required.');
      return;
    }
    if (!devPassword) {
      setValidationError('Dev password is required.');
      return;
    }
    setValidationError(null);
    setLoading(true);
    try {
      await devLogin(devEmail.trim(), devPassword);
      toast.success('Signed in (dev mode)');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            E
          </div>
          <h1 className="text-xl font-semibold text-slate-800">Mini ERP</h1>
          <p className="mt-1 text-sm text-slate-500">Sales &amp; Inventory Management</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {verifiedNotice ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Email verified. Sign in to activate your administrator account.
            </div>
          ) : null}

          {passwordResetNotice ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Password changed. Sign in with your new password.
            </div>
          ) : null}

          {authError ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {authError}
            </div>
          ) : null}

          {validationError ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {validationError}
            </div>
          ) : null}

          {step === 'credentials' ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Email" required>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </Field>
              <Field label="Password" required>
                <PasswordInput
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Forgot password?
                </Link>
              </div>
              <Button type="submit" loading={loading} className="w-full">
                <KeyRound className="h-4 w-4" />
                Sign in
              </Button>
            </form>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs leading-relaxed text-indigo-800">
                An administrator invited you. Set your new password to finish creating your account
                (for <span className="font-medium">{email.trim()}</span>).
              </div>
              <Field label="New password" required hint="At least 8 characters.">
                <PasswordInput
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              <Field label="Confirm password" required>
                <PasswordInput
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              <Button type="submit" loading={loading} className="w-full">
                Set new password
              </Button>
            </form>
          )}

          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-400">
            Authentication is provided by AWS Cognito. Your ERP role is assigned by an administrator.
          </p>

          {step === 'credentials' ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-center text-sm text-slate-500">New to Mini ERP?</p>
              <Button
                type="button"
                variant="secondary"
                className="mt-2 w-full"
                onClick={() => navigate('/signup')}
              >
                <UserPlus className="h-4 w-4" />
                Sign up
              </Button>
              <p className="mt-2 text-center text-xs leading-relaxed text-slate-400">
                Public signup creates an ADMIN account. All other roles require an ADMIN invitation.
              </p>
            </div>
          ) : null}

          {isDevBuild && step === 'credentials' ? (
            <div className="mt-4 border-t border-dashed border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  setDevOpen((v) => !v);
                  setValidationError(null);
                }}
                className="mx-auto flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-indigo-600"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                {devOpen ? 'Hide developer login' : 'Developer login (demo)'}
              </button>

              {devOpen ? (
                <form onSubmit={onDevSubmit} className="mt-3 space-y-3 rounded-lg bg-amber-50 p-3">
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    Demo mode — no AWS needed. Employees invited in dev mode sign in with the
                    temporary password shown to the admin.
                  </p>
                  <Field label="Dev email" required>
                    <Input
                      type="email"
                      autoComplete="off"
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      placeholder="employee@company.com"
                    />
                  </Field>
                  <Field label="Dev password" required>
                    <PasswordInput
                      autoComplete="off"
                      value={devPassword}
                      onChange={(e) => setDevPassword(e.target.value)}
                      placeholder="Temporary password"
                    />
                  </Field>
                  <Button type="submit" loading={loading} variant="secondary" className="w-full">
                    Sign in with developer account
                  </Button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
