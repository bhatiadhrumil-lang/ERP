import { useCallback, useEffect, useState } from 'react';
import * as dashApi from '../services/dashboard';
import { useToast } from '../hooks/useToast';
import { apiErrorMessage } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { User, UserRole } from '../types';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Field';
import { RoleBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { ROLE_LABELS } from '../utils/constants';
import { formatDateTime } from '../utils/format';

export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashApi.listUsers();
      setUsers(res.items);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(user: User, role: UserRole) {
    if (role === user.role) return;
    if (me?.id === user.id) {
      toast.error('You cannot change your own role');
      return;
    }
    setUpdatingId(user.id);
    try {
      const updated = await dashApi.updateUser(user.id, { role });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`${updated.name} is now ${ROLE_LABELS[updated.role]}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleActive(user: User) {
    if (me?.id === user.id) {
      toast.error('You cannot deactivate your own account');
      return;
    }
    setUpdatingId(user.id);
    try {
      const updated = await dashApi.updateUser(user.id, { isActive: !user.isActive });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(updated.isActive ? `${updated.name} re-enabled` : `${updated.name} disabled`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <Card>
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-800">Users &amp; roles</h2>
        <p className="text-xs text-slate-500">
          Cognito identities are mapped to app users via <code className="rounded bg-slate-100 px-1">cognitoSub</code>.
          Passwords are never stored — Cognito owns credentials.
        </p>
      </div>
      <div className="border-t border-slate-100">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : users.length === 0 ? (
          <EmptyState title="No users" message="Seed the database to create development users." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Created</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">
                        {u.name} {me?.id === u.id ? <span className="text-xs text-slate-400">(you)</span> : null}
                      </p>
                      <p className="text-xs text-slate-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={u.role} />
                        <Select
                          className="w-32"
                          value={u.role}
                          disabled={updatingId === u.id || me?.id === u.id}
                          onChange={(e) => void changeRole(u, e.target.value as UserRole)}
                        >
                          {Object.entries(ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </Select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => void toggleActive(u)}
                        disabled={updatingId === u.id || me?.id === u.id}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          u.isActive ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                        } disabled:opacity-50`}
                      >
                        {u.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(u.createdAt)}</td>
                    <td className="px-4 py-3" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}