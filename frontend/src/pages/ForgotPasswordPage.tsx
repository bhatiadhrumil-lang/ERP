import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, MailCheck } from 'lucide-react';
import { authService, authErrorMessage } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Field, Input, PasswordInput } from '../components/ui/Field';

type Step = 'email' | 'reset';

/**
 * Password reset page.
 *
 * Two steps, both handled directly against Cognito via Amplify:
 *  1. Enter the account email → Cognito emails a confirmation code.
 *  2. Enter the code + a new password → confirmResetPassword completes the
 *     reset, then the user signs in normally on /login.
 */
export function ForgotPasswordPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(email.trim());
      setNotice('Reset code sent. Check your inbox for the code.');
      setStep('reset');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await authService.resetPassword(email.trim());
      setNotice('A new reset code has been sent.');
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!code.trim()) {
      setError('Enter the reset code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await authService.confirmResetPassword(email.trim(), code.trim(), newPassword);
      navigate('/login', { state: { passwordReset: true } });
    } catch (err) {
      setError(authErrorMessage(err));
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
          <h1 className="text-xl font-semibold text-slate-800">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-500">
            {step === 'email'
              ? 'Enter your account email to receive a reset code'
              : `Enter the code sent to ${email.trim()}`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </div>
          ) : null}

          {step === 'email' ? (
            <form onSubmit={sendCode} className="space-y-4">
              <Field label="Email" required>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </Field>
              <Button type="submit" loading={loading} className="w-full">
                <MailCheck className="h-4 w-4" />
                Send reset code
              </Button>
            </form>
          ) : (
            <form onSubmit={resetPassword} className="space-y-4">
              <Field label="Reset code" required hint="The 6-digit code from your email.">
                <Input
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                />
              </Field>
              <Field label="New password" required hint="At least 8 characters, with letters, numbers and a symbol.">
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
                <KeyRound className="h-4 w-4" />
                Reset password
              </Button>
            </form>
          )}

          {step === 'reset' ? (
            <button
              type="button"
              onClick={resendCode}
              disabled={loading}
              className="mt-4 w-full text-center text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
            >
              Resend reset code
            </button>
          ) : null}

          <p className="mt-3 text-center text-sm text-slate-500">
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Back to sign in
            </Link>
          </p>
          <p className="mt-1 text-center text-sm text-slate-500">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
