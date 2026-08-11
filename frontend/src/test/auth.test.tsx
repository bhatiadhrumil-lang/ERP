import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../App';
import type { AppUser } from '../services/authService';

// ---------------------------------------------------------------------------
// Mock the auth service seam so AWS Amplify / Cognito never loads in jsdom.
// ---------------------------------------------------------------------------
vi.mock('../services/authService', () => ({
  authService: {
    ensureConfigured: vi.fn(async () => undefined),
    signUp: vi.fn(async () => undefined),
    confirmSignUp: vi.fn(async () => undefined),
    resendSignUpCode: vi.fn(async () => undefined),
    signIn: vi.fn(async () => ({ status: 'DONE' })),
    devLogin: vi.fn(async () => adminUser),
    completeNewPassword: vi.fn(async () => undefined),
    resetPassword: vi.fn(async () => undefined),
    confirmResetPassword: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    getCurrentUser: vi.fn(async () => ({ userId: 'u1', username: 'admin@mini-erp.local' })),
    getAccessToken: vi.fn(async () => 'fake-access-token'),
    getIdToken: vi.fn(async () => null),
  },
  hasDevToken: vi.fn(() => false),
}));

vi.mock('../services/auth', () => ({
  fetchMe: vi.fn(),
}));

// Backend unreachable in jsdom: the bootstrap flow is a no-op here.
vi.mock('../services/bootstrap', () => ({
  getBootstrapStatus: vi.fn(async () => ({ initialized: true })),
  bootstrapAdmin: vi.fn(async () => {
    throw new Error('ADMIN_ALREADY_INITIALIZED');
  }),
}));

vi.mock('../config/amplify', () => ({
  isCognitoConfigured: true,
  SELF_SIGNUP_ENABLED: false,
}));

import { authService } from '../services/authService';
import { fetchMe } from '../services/auth';
import { getBootstrapStatus } from '../services/bootstrap';
import { __resetBootstrapStatusCache } from '../hooks/useBootstrapStatus';

const adminUser: AppUser = {
  id: 'user-1',
  cognitoSub: 'sub-admin',
  name: 'Admin User',
  email: 'admin@mini-erp.local',
  role: 'ADMIN',
  status: 'ACTIVE',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

describe('frontend authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetBootstrapStatusCache();
    // Default: a Cognito session exists and the ERP user resolves.
    vi.mocked(authService.getCurrentUser).mockResolvedValue({
      userId: 'u1',
      username: 'admin@mini-erp.local',
    });
    vi.mocked(fetchMe).mockResolvedValue(adminUser);
    vi.mocked(getBootstrapStatus).mockResolvedValue({ initialized: true });
  });

  it('10. unauthenticated user is redirected to /login (no protected UI flash)', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));

    renderApp('/dashboard');

    // While the session is being resolved a loading state is shown…
    expect(screen.getByText(/checking session/i)).toBeInTheDocument();

    // …then the protected route redirects to the login page.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByText(/checking session/i)).not.toBeInTheDocument();
    });
    expect(fetchMe).not.toHaveBeenCalled();
  });

  it('fresh deployments start at signup, not login', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    vi.mocked(getBootstrapStatus).mockResolvedValue({ initialized: false });

    renderApp('/');

    expect(await screen.findByRole('button', { name: /create administrator account/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it('initialized deployments start at normal login', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    vi.mocked(getBootstrapStatus).mockResolvedValue({ initialized: true });

    renderApp('/');

    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
  });

  it('shows a Sign up button on login that leads to the admin signup page', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    vi.mocked(getBootstrapStatus).mockResolvedValue({ initialized: false });

    renderApp('/login');

    // The Sign up button is always visible, initialized or not.
    expect(await screen.findByRole('button', { name: /sign up/i })).toBeInTheDocument();
    expect(screen.getByText(/public signup creates an admin account/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));

    // Lands on the signup page with the admin-creation form.
    expect(await screen.findByRole('button', { name: /create administrator account/i })).toBeInTheDocument();
    expect(screen.getByText(/admin account will be created/i)).toBeInTheDocument();
  });

  it('11. authenticated user can reach the dashboard', async () => {
    renderApp('/dashboard');

    await screen.findByText('Admin User');
    // Dashboard layout is rendered (protected route allowed).
    expect((await screen.findAllByText('Dashboard')).length).toBeGreaterThan(0);
  });

  it('12. logout signs out of Cognito and protected routes become inaccessible', async () => {
    renderApp('/dashboard');

    await screen.findByText('Admin User');

    fireEvent.click(screen.getByTitle('Sign out'));

    await waitFor(() => {
      expect(authService.signOut).toHaveBeenCalled();
    });
    // Back on the login page; navigating to a protected route keeps us there.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });
    expect(screen.queryByText('Admin User')).not.toBeInTheDocument();
  });

  it('login calls Cognito signIn with email + password then lands on the dashboard', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'sales@mini-erp.local' } });
    fireEvent.change(screen.getByLabelText(/password/i, { selector: 'input' }), {
      target: { value: 'Secret123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(authService.signIn).toHaveBeenCalledWith('sales@mini-erp.local', 'Secret123!');
    });
    await screen.findByText('Admin User');
  });

  it('login shows validation errors without calling Cognito', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
    expect(authService.signIn).not.toHaveBeenCalled();
  });

  it('password fields have a show/hide toggle', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    const passwordInput = screen.getByLabelText(/password/i, { selector: 'input' });
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Toggle reveals the typed password…
    fireEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(screen.getByLabelText(/password/i, { selector: 'input' })).toHaveAttribute('type', 'text');

    // …and hides it again.
    fireEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(screen.getByLabelText(/password/i, { selector: 'input' })).toHaveAttribute('type', 'password');
  });

  it('dev-mode login signs in with email + temp password (demo, no AWS)', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    // The dev form is collapsed until toggled.
    expect(screen.queryByLabelText(/dev email/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /developer login \(demo\)/i }));

    fireEvent.change(screen.getByLabelText(/dev email/i), { target: { value: 'dev@mini-erp.local' } });
    fireEvent.change(screen.getByLabelText(/dev password/i, { selector: 'input' }), {
      target: { value: 'Temp!abc123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in with developer account/i }));

    await waitFor(() => {
      expect(authService.devLogin).toHaveBeenCalledWith('dev@mini-erp.local', 'Temp!abc123');
    });
    await screen.findByText('Admin User');
  });

  it('login surfaces credentials errors', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    vi.mocked(authService.signIn).mockRejectedValue(new Error('Incorrect email or password.'));
    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'sales@mini-erp.local' } });
    fireEvent.change(screen.getByLabelText(/password/i, { selector: 'input' }), {
      target: { value: 'wrongpass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
  });

  it('20. invited employee first login shows "Set your new password" and completes the Cognito challenge', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    vi.mocked(authService.signIn).mockResolvedValue({ status: 'NEW_PASSWORD_REQUIRED' });
    renderApp('/login');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'sales@mini-erp.local' } });
    fireEvent.change(screen.getByLabelText(/password/i, { selector: 'input' }), {
      target: { value: 'Temporary123!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    // The challenge form replaces the credentials form.
    expect(await screen.findByText(/set your new password/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewSecret123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'NewSecret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }));

    await waitFor(() => {
      expect(authService.completeNewPassword).toHaveBeenCalledWith('NewSecret123!');
    });
    // Challenge completed → session resolved → dashboard.
    await screen.findByText('Admin User');
  });

  it('signup is unavailable once the first ADMIN exists (managed-by-administrator screen)', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    renderApp('/signup');

    expect(await screen.findByText(/administrator account already set up/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create administrator account/i })).not.toBeInTheDocument();
  });

  it('before bootstrap, signup creates the Cognito identity and continues to email verification', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    vi.mocked(getBootstrapStatus).mockResolvedValue({ initialized: false });
    renderApp('/signup');

    expect(await screen.findByRole('button', { name: /create administrator account/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'Secret123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /create administrator account/i }));

    await waitFor(() => {
      expect(authService.signUp).toHaveBeenCalledWith({
        email: 'jane@example.com',
        password: 'Secret123!',
      });
    });
    expect(await screen.findByText(/verify your email/i)).toBeInTheDocument();
  });

  it('forgot password sends a reset code, then resets the password and returns to login', async () => {
    vi.mocked(authService.getCurrentUser).mockRejectedValue(new Error('NO_SESSION'));
    renderApp('/forgot-password');

    expect(await screen.findByRole('button', { name: /send reset code/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'admin@mini-erp.local' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

    await waitFor(() => {
      expect(authService.resetPassword).toHaveBeenCalledWith('admin@mini-erp.local');
    });

    // Step 2: enter the emailed code + new password.
    expect(await screen.findByRole('button', { name: /reset password/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/reset code/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewSecret123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'NewSecret123!' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(authService.confirmResetPassword).toHaveBeenCalledWith(
        'admin@mini-erp.local',
        '123456',
        'NewSecret123!',
      );
    });
    // Back on the login page with the "password changed" notice.
    expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
  });
});
