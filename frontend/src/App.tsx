import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ProtectedRoute, RoleRoute } from './routes/guards';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ConfirmSignupPage } from './pages/ConfirmSignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { FollowUpsPage } from './pages/FollowUpsPage';
import { ProductsPage } from './pages/ProductsPage';
import { InventoryPage } from './pages/InventoryPage';
import { ChallansPage } from './pages/ChallansPage';
import { ChallanNewPage } from './pages/ChallanNewPage';
import { ChallanDetailPage } from './pages/ChallanDetailPage';
import { UsersPage } from './pages/UsersPage';
import { Spinner } from './components/ui/Feedback';
import { useBootstrapStatus } from './hooks/useBootstrapStatus';

function HomeRedirect() {
  const { user, loading } = useAuth();
  const { initialized } = useBootstrapStatus();

  // The initial public route is determined by the backend's ADMIN count:
  // fresh deployments start their one-time bootstrap at /signup, while every
  // initialized deployment starts at the normal sign-in page. Wait for both
  // checks so the browser never briefly lands on the wrong page.
  if (loading || initialized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (!user) return <Navigate to={initialized ? '/login' : '/signup'} replace />;
  if (user.role === 'WAREHOUSE') return <Navigate to="/products" replace />;
  return <Navigate to="/dashboard" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/confirm-signup" element={<ConfirmSignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route index element={<HomeRedirect />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route
                path="dashboard"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES', 'ACCOUNTS']}>
                    <DashboardPage />
                  </RoleRoute>
                }
              />

              <Route
                path="customers"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES', 'ACCOUNTS']}>
                    <CustomersPage />
                  </RoleRoute>
                }
              />
              <Route
                path="customers/:id"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES', 'ACCOUNTS']}>
                    <CustomerDetailPage />
                  </RoleRoute>
                }
              />

              <Route
                path="followups"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES']}>
                    <FollowUpsPage />
                  </RoleRoute>
                }
              />

              <Route
                path="products"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES', 'WAREHOUSE']}>
                    <ProductsPage />
                  </RoleRoute>
                }
              />

              <Route
                path="inventory"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES', 'WAREHOUSE']}>
                    <InventoryPage tab="stock" />
                  </RoleRoute>
                }
              />
              <Route
                path="inventory/movements"
                element={
                  <RoleRoute roles={['ADMIN', 'WAREHOUSE']}>
                    <InventoryPage tab="movements" />
                  </RoleRoute>
                }
              />

              <Route
                path="challans"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES', 'ACCOUNTS']}>
                    <ChallansPage />
                  </RoleRoute>
                }
              />
              <Route
                path="challans/new"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES']}>
                    <ChallanNewPage />
                  </RoleRoute>
                }
              />
              <Route
                path="challans/:id"
                element={
                  <RoleRoute roles={['ADMIN', 'SALES', 'ACCOUNTS']}>
                    <ChallanDetailPage />
                  </RoleRoute>
                }
              />

              <Route
                path="users"
                element={
                  <RoleRoute roles={['ADMIN']}>
                    <UsersPage />
                  </RoleRoute>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
