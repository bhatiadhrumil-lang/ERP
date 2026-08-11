import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MailCheck, ShieldAlert } from 'lucide-react';
import { authService } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { useBootstrapStatus } from '../hooks/useBootstrapStatus';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';

export function ConfirmSignupPage() {
  const { isAuthenticated } = useAuth();
  const { initialized } = useBootstrapStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const prefillEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(prefillEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  if (initialized === true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Account creation is managed by an administrator</h1>
          <Link
            to="/login"
            className="mt-5 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (!code.trim()) return setError('Enter the verification code from your email.');

    setLoading(true);
    try {
      await authService.confirmSignUp(email.trim(), code.trim());
      setNotice('Email verified. You can now sign in.');
      // First-admin setup: signing in after verification activates the ADMIN
      // account (the backend promotes the verified identity, one-time only).
      navigate('/login', { state: { verified: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed.');
    } finally {
      setLoading(false);
    }
  }

  async function resend(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return setError('Enter your email address first.');
    try {
      await authService.resendSignUpCode(email.trim());
      setNotice('A new verification code has been sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            E
          </div>
          <h1 className="text-xl font-semibold text-slate-800">Verify your email</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the code we emailed you</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}
          {notice ? (
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </Field>
            <Field label="Verification code" required>
              <Input
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              <MailCheck className="h-4 w-4" />
              Verify email
            </Button>
          </form>

          <button
            type="button"
            onClick={resend}
            className="mt-4 w-full text-center text-xs font-medium text-indigo-600 hover:text-indigo-500"
          >
            Resend verification code
          </button>

          <p className="mt-3 text-center text-sm text-slate-500">
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}