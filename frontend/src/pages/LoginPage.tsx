import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import { DEV_LOGIN_ACCOUNTS } from '../utils/constants';
import { Button } from '../components/ui/Button';
import { Field, Select } from '../components/ui/Field';

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState<string>(DEV_LOGIN_ACCOUNTS[0].email);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await login(email);
      toast.success(`Signed in as ${email}`);
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
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Development user" required hint="Local development only — production uses AWS Cognito">
              <Select value={email} onChange={(e) => setEmail(e.target.value)}>
                {DEV_LOGIN_ACCOUNTS.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Sign in
            </Button>
          </form>

          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-400">
            This screen is the <strong>development-only</strong> sign-in. In production the backend validates AWS
            Cognito JWTs and this page is replaced by the Cognito hosted UI flow.
          </p>
        </div>
      </div>
    </div>
  );
}