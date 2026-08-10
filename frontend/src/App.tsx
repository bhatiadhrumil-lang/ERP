import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ProtectedRoute, RoleRoute } from './routes/guards';
import { LoginPage } from './pages/LoginPage';
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

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'WAREHOUSE') return <Navigate to="/products" replace />;
  return <Navigate to="/dashboard" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route index element={<HomeRedirect />} />

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