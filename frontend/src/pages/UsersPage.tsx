import { useCallback, useEffect, useState } from 'react';
import * as usersApi from '../services/users';
import { apiErrorMessage } from '../services/apiClient';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import type { User, UserRole, UserStatus } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Toolbar, SearchBox, FilterSelect } from '../components/ui/Toolbar';
import { RoleBadge, UserStatusBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback';
import { InviteEmployeeModal } from '../components/InviteEmployeeModal';
import { ROLE_LABELS, USER_STATUS_LABELS } from '../utils/constants';
import { formatDateTime } from '../utils/format';

const ROLE_FILTERS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const STATUS_FILTERS = Object.entries(USER_STATUS_LABELS).map(([value, label]) => ({ value, label }));

/**
 * Admin-only user management (backend enforces ADMIN; this UI is just UX).
 * Actions follow the user status:
 *   INVITED  → resend invitation
 *   ACTIVE   → change role, disable
 *   DISABLED → enable
 */
export function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { limit: 100 } as { limit: number; search?: string; role?: UserRole; status?: UserStatus };
      if (search.trim()) params.search = search.trim();
      if (roleFilter) params.role = roleFilter as UserRole;
      if (statusFilter) params.status = statusFilter as UserStatus;
      const res = await usersApi.listUsers(params);
      setUsers(res.items);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(user: User, role: UserRole) {
    if (role === user.role) return;
    setBusyId(user.id);
    try {
      const updated = await usersApi.changeUserRole(user.id, role);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`${updated.name} is now ${ROLE_LABELS[updated.role]}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function disable(user: User) {
    setBusyId(user.id);
    try {
      const updated = await usersApi.disableUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`${updated.name} disabled`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function enable(user: User) {
    setBusyId(user.id);
    try {
      const updated = await usersApi.enableUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      toast.success(`${updated.name} re-enabled`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function resend(user: User) {
    setBusyId(user.id);
    try {
      await usersApi.resendInvitation(user.id);
      toast.success(`Invitation re-sent to ${user.email}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const busy = (id: string) => busyId === id;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Users &amp; roles</h2>
          <p className="text-xs text-slate-500">
            Employees enter through ADMIN invitations only. An employee is added here only after
            Cognito creates their account and sends its invitation email.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <span className="text-base leading-none">+</span> Invite employee
        </Button>
      </div>

      <div className="border-t border-slate-100 px-5 py-3">
        <Toolbar>
          <SearchBox value={search} onChange={setSearch} placeholder="Search name or email…" />
          <FilterSelect value={roleFilter} onChange={setRoleFilter} options={ROLE_FILTERS} placeholder="All roles" />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_FILTERS}
            placeholder="All statuses"
          />
        </Toolbar>
      </div>

      <div className="border-t border-slate-100">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : users.length === 0 ? (
          <EmptyState title="No users" message="Invite an employee to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-semibold">User</th>
                  <th className="px-4 py-2.5 font-semibold">Role</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Created</th>
                  <th className="px-4 py-2.5 font-semibold">Actions</th>
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
                        {u.status === 'ACTIVE' ? (
                          <select
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none disabled:opacity-50"
                            value={u.role}
                            disabled={busy(u.id) || me?.id === u.id}
                            onChange={(e) => void changeRole(u, e.target.value as UserRole)}
                            title="Change role"
                          >
                            {Object.entries(ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <UserStatusBadge status={u.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {u.status === 'INVITED' ? (
                          <Button size="sm" variant="secondary" disabled={busy(u.id)} onClick={() => void resend(u)}>
                            Resend invitation
                          </Button>
                        ) : null}
                        {u.status === 'ACTIVE' && me?.id !== u.id ? (
                          <Button size="sm" variant="danger" disabled={busy(u.id)} onClick={() => void disable(u)}>
                            Disable
                          </Button>
                        ) : null}
                        {u.status === 'DISABLED' ? (
                          <Button size="sm" variant="success" disabled={busy(u.id)} onClick={() => void enable(u)}>
                            Enable
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteEmployeeModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(user) => {
          setUsers((prev) => [user, ...prev]);
          toast.success(`Cognito invitation sent to ${user.email}.`);
        }}
      />
    </Card>
  );
}
