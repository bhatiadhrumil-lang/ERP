import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useBootstrapStatus } from '../hooks/useBootstrapStatus';
import { authService, authErrorMessage } from '../services/authService';
import { Button } from '../components/ui/Button';
import { Field, Input, PasswordInput } from '../components/ui/Field';

/**
 * First-administrator setup (public bootstrap).
 *
 * Only reachable while NO ADMIN exists (backend-enforced — the /signup page is
 * just UX). The flow: sign up via Cognito → verify the emailed code on
 * /confirm-signup → sign in — at which point the backend promotes the verified
 * identity to ADMIN (POST /api/auth/bootstrap-admin, one-time, race-safe).
 * There is no role field here and no way to self-select ADMIN — bootstrap
 * grants the role, never user input.
 */
export function SignupPage() {
  const { isAuthenticated } = useAuth();
  const { initialized } = useBootstrapStatus();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  function validate(): string | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (initialized) return; // backend would refuse anyway
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await authService.signUp({ email: email.trim(), password });
      navigate('/confirm-signup', { state: { email: email.trim() } });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (initialized === true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
              E
            </div>
            <h1 className="text-xl font-semibold text-slate-800">Mini ERP</h1>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
            <h2 className="text-sm font-semibold text-slate-800">Administrator account already set up</h2>
            <p className="mt-2 text-sm text-slate-500">
              New employees are added by an administrator through an invitation. Contact your
              administrator to get access.
            </p>
            <Link
              to="/login"
              className="mt-4 inline-block font-medium text-indigo-600 hover:text-indigo-500"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            E
          </div>
          <h1 className="text-xl font-semibold text-slate-800">Mini ERP</h1>
          <p className="mt-1 text-sm text-slate-500">Initial administrator setup</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-800">
              <span className="font-semibold">Admin account will be created.</span> The account
              registered here becomes the ADMIN of this ERP with full access after email
              verification and first sign-in. This is the only public signup — SALES, WAREHOUSE
              and ACCOUNTS users must be invited by an administrator.
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Password" required hint="At least 8 characters, with letters, numbers and a symbol.">
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm password" required>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              <UserPlus className="h-4 w-4" />
              Create administrator account
            </Button>
          </form>

          <p className="mt-3 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
