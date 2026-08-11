import { useState } from 'react';
import type { FormEvent } from 'react';
import { inviteUser } from '../services/users';
import { apiErrorMessage } from '../services/apiClient';
import type { User } from '../types';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field, Input, Select } from './ui/Field';
import { INVITE_ROLES, ROLE_LABELS } from '../utils/constants';

interface Props {
  open: boolean;
  onClose: () => void;
  onInvited: (user: User) => void;
}

/**
 * "Invite Employee" form. The role dropdown only offers SALES / WAREHOUSE /
 * ACCOUNTS — ADMIN is deliberately absent; the backend rejects it anyway.
 * Cognito sends the invitation email with a temporary password; no password
 * ever passes through this form.
 */
export function InviteEmployeeModal({ open, onClose, onInvited }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<(typeof INVITE_ROLES)[number]>('SALES');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Dev mode (no AWS): temp password returned by the backend, shown once.
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  function close() {
    setTempPassword(null);
    setError(null);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const { user, tempPassword } = await inviteUser({ name: name.trim(), email: email.trim(), role });
      setName('');
      setEmail('');
      setRole('SALES');
      if (tempPassword) {
        // Dev mode (no AWS email): show the temp password so the admin can
        // hand it to the employee — keep the modal open until acknowledged.
        setTempPassword({ email: user.email, password: tempPassword });
        return;
      }
      onInvited(user);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} title="Invite employee" onClose={close}>
      {tempPassword ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-medium text-amber-900">Account created (demo mode)</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              No email was sent. Share these credentials with the employee — they sign in with the
              Developer login on the sign-in page:
            </p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Email</dt>
                <dd className="font-mono font-medium text-slate-800">{tempPassword.email}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Temporary password</dt>
                <dd className="font-mono font-medium text-slate-800">{tempPassword.password}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(`${tempPassword.email}\n${tempPassword.password}`)}
              className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              Copy email &amp; password
            </button>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Smith"
            autoFocus
            required
            minLength={2}
          />
        </Field>

        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="john@company.com"
            required
          />
        </Field>

        <Field
          label="ERP role"
          required
          hint="The employee will receive a Cognito invitation email at this address with a temporary password."
        >
          <Select value={role} onChange={(e) => setRole(e.target.value as (typeof INVITE_ROLES)[number])}>
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>

        {error ? <p className="text-xs text-red-600">{error}</p> : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" loading={sending} disabled={!name.trim() || !email.trim()}>
            {sending ? 'Sending…' : 'Send invitation'}
          </Button>
        </div>
        </form>
      )}
    </Modal>
  );
}
