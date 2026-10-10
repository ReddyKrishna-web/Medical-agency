import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from '@/components/layout/PublicLayout';
import AuthLayout from '@/components/layout/AuthLayout';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { LoadingState } from '@/components/ui/States';
import { AuthenticatedGuard, PendingApprovalPage, PublicOnly, RoleGuard, RoleRedirect, UnauthorizedPage } from '@/routes/guards';
import { NotFoundPage, SessionExpiredPage } from '@/routes/StatusPages';

// Public and auth routes
const Home = lazy(() => import('@/pages/public/HomePage'));
const About = lazy(() => import('@/pages/public/AboutPage'));
const Solutions = lazy(() => import('@/pages/public/SolutionsPage'));
const Features = lazy(() => import('@/pages/public/FeaturesPage'));
const HowItWorks = lazy(() => import('@/pages/public/HowItWorksPage'));
const Contact = lazy(() => import('@/pages/public/ContactPage'));
const Privacy = lazy(() => import('@/pages/public/LegalPage').then((m) => ({ default: m.PrivacyPage })));
const Terms = lazy(() => import('@/pages/public/LegalPage').then((m) => ({ default: m.TermsPage })));
const Login = lazy(() => import('@/pages/auth/LoginPage'));
const Register = lazy(() => import('@/pages/auth/RegisterPage'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPasswordPage'));

// Shared role pages
const OrdersList = lazy(() => import('@/pages/shared/OrdersListPage'));
const OrderBuilder = lazy(() => import('@/pages/shared/OrderBuilderPage'));
const OrderDetail = lazy(() => import('@/pages/shared/OrderDetailPage'));
const InvoicesList = lazy(() => import('@/pages/shared/InvoicesListPage'));
const InvoiceDetail = lazy(() => import('@/pages/shared/InvoiceDetailPage'));
const Messages = lazy(() => import('@/pages/shared/MessagesPage'));
const Notifications = lazy(() => import('@/pages/shared/NotificationsPage'));
const Profile = lazy(() => import('@/pages/shared/ProfilePage'));
const RequirementsList = lazy(() => import('@/pages/shared/RequirementsListPage'));
const RequirementDetail = lazy(() => import('@/pages/shared/RequirementDetailPage'));
const FollowUps = lazy(() => import('@/pages/shared/FollowUpsPage'));

// Customer
const CustomerDashboard = lazy(() => import('@/pages/customer/DashboardPage'));
const Catalog = lazy(() => import('@/pages/customer/CatalogPage'));
const Reorder = lazy(() => import('@/pages/customer/ReorderPage'));

// Salesman
const SalesDashboard = lazy(() => import('@/pages/salesman/DashboardPage'));
const SalesCustomers = lazy(() => import('@/pages/salesman/CustomersPage'));
const SalesCustomerDetail = lazy(() => import('@/pages/salesman/CustomerDetailPage'));

// Agency admin
const AdminDashboard = lazy(() => import('@/pages/admin/DashboardPage'));
const AdminCustomers = lazy(() => import('@/pages/admin/CustomersPage'));
const AdminSalesmen = lazy(() => import('@/pages/admin/SalesmenPage'));
const Products = lazy(() => import('@/pages/admin/ProductsPage'));
const Categories = lazy(() => import('@/pages/admin/CategoriesPage'));
const Inventory = lazy(() => import('@/pages/admin/InventoryPage'));
const PaymentsPage = lazy(() => import('@/pages/admin/PaymentsPage'));
const Reports = lazy(() => import('@/pages/admin/ReportsPage'));
const AIAssistant = lazy(() => import('@/pages/admin/AIAssistantPage'));
const Activity = lazy(() => import('@/pages/admin/ActivityPage'));
const ContactSubmissions = lazy(() => import('@/pages/admin/ContactSubmissionsPage'));
const Settings = lazy(() => import('@/pages/admin/SettingsPage'));

const customerGuard = (
  <RoleGuard roles={['customer']}>
    <DashboardLayout />
  </RoleGuard>
);
const salesmanGuard = (
  <RoleGuard roles={['salesman']}>
    <DashboardLayout />
  </RoleGuard>
);
const adminGuard = (
  <RoleGuard roles={['admin']}>
    <DashboardLayout />
  </RoleGuard>
);

function RouteLoading() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <LoadingState rows={6} />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="about" element={<About />} />
          <Route path="solutions" element={<Solutions />} />
          <Route path="features" element={<Features />} />
          <Route path="how-it-works" element={<HowItWorks />} />
          <Route path="contact" element={<Contact />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
        </Route>

        <Route element={<AuthLayout />}>
          <Route path="login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
          <Route path="reset-password" element={<PublicOnly><ResetPassword /></PublicOnly>} />
        </Route>

        <Route path="session-expired" element={<SessionExpiredPage />} />
        <Route path="app" element={<RoleRedirect />} />
        {/* A pending account may sign in but every business route answers 403. */}
        <Route
          path="pending-approval"
          element={
            <AuthenticatedGuard>
              <PendingApprovalPage />
            </AuthenticatedGuard>
          }
        />

        <Route path="customer" element={customerGuard}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<CustomerDashboard />} />
          <Route path="products" element={<Catalog />} />
          <Route path="catalog" element={<Navigate to="../products" replace />} />
          <Route path="create-order" element={<OrderBuilder />} />
          <Route path="orders" element={<OrdersList />} />
          <Route path="orders/new" element={<Navigate to="../create-order" replace />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="reorder" element={<Reorder />} />
          <Route path="requirements" element={<RequirementsList />} />
          <Route path="requirements/:id" element={<RequirementDetail />} />
          <Route path="invoices" element={<InvoicesList />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="messages" element={<Messages />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="salesman" element={salesmanGuard}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SalesDashboard />} />
          <Route path="customers" element={<SalesCustomers />} />
          <Route path="customers/:id" element={<SalesCustomerDetail />} />
          <Route path="create-order" element={<OrderBuilder />} />
          <Route path="orders" element={<OrdersList />} />
          <Route path="orders/new" element={<Navigate to="../create-order" replace />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="follow-ups" element={<FollowUps />} />
          <Route path="messages" element={<Messages />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="admin" element={adminGuard}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="orders" element={<OrdersList />} />
          <Route path="create-order" element={<OrderBuilder />} />
          <Route path="orders/new" element={<Navigate to="../create-order" replace />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="salesmen" element={<AdminSalesmen />} />
          <Route path="products" element={<Products />} />
          <Route path="categories" element={<Categories />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="requirements" element={<RequirementsList />} />
          <Route path="requirements/:id" element={<RequirementDetail />} />
          <Route path="invoices" element={<InvoicesList />} />
          <Route path="invoices/:id" element={<InvoiceDetail />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="reports" element={<Reports />} />
          <Route path="ai" element={<AIAssistant />} />
          <Route path="activity" element={<Activity />} />
          <Route path="contact-submissions" element={<ContactSubmissions />} />
          <Route path="messages" element={<Messages />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        <Route path="unauthorized" element={<UnauthorizedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
