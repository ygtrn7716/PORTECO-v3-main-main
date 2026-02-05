// src/App.tsx
import { Routes, Route, useLocation } from "react-router-dom";

import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";

import Home from "./pages/Home";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import BlogPage from "@/pages/BlogPage";
import BlogDetailPage from "@/pages/BlogDetailPage";

import ProtectedRoute from "./components/auth/ProtectedRoute";
import AdminRoute from "@/components/auth/AdminRoute";

import Dashboard from "./pages/Dashboard";
import ProfilePage from "./pages/ProfilePage";

import ScrollToTop from "@/components/motion/ScrollToTop";

import ConsumptionDetail from "@/components/dashboard/ConsumptionDetail";
import YekdemDetail from "@/components/dashboard/YekdemDetail";
import InvoiceDetail from "@/components/dashboard/InvoiceDetail";
import PtfDetail from "@/components/dashboard/PtfDetail";
import YekdemMahsupDetail from "@/components/dashboard/YekdemMahsupDetail";
import ChartsPage from "@/components/dashboard/ChartsPage";
import AlertsPage from "@/pages/AlertsPage";

import FilesPage from "@/pages/FilesPage";
import InvoiceHistory from "@/pages/InvoiceHistory";
import InvoiceSnapshotDetail from "@/pages/InvoiceSnapshotDetail";

// Admin pages
import AdminHome from "@/pages/admin/AdminHome";
import UserIntegrationsAdmin from "@/pages/admin/UserIntegrationsAdmin";
import SubscriptionSettingsAdmin from "@/pages/admin/SubscriptionSettingsAdmin";
import SubscriptionYekdemAdmin from "@/pages/admin/SubscriptionYekdemAdmin";
import DistributionTariffAdmin from "@/pages/admin/DistributionTariffAdmin";
import PostsAdmin from "@/pages/admin/PostsAdmin";
import OwnerSubscriptionsAdmin from "@/pages/admin/OwnerSubscriptionsAdmin";
import NotificationChannelsAdmin from "@/pages/admin/NotificationChannelsAdmin";
import UserPhoneNumbersAdmin from "@/pages/admin/UserPhoneNumbersAdmin";
import SmsLogsAdmin from "@/pages/admin/SmsLogsAdmin";
import ReactiveAlertsAdmin from "@/pages/admin/ReactiveAlertsAdmin";
import NotificationEventsAdmin from "@/pages/admin/NotificationEventsAdmin";
import EpiasPtfAdmin from "@/pages/admin/EpiasPtfAdmin";
import InvoiceSnapshotsAdmin from "@/pages/admin/InvoiceSnapshotsAdmin";
import MonthlyOverviewAdmin from "@/pages/admin/MonthlyOverviewAdmin";
import ContactMessagesAdmin from "@/pages/admin/ContactMessagesAdmin";

export default function App() {
  const { pathname } = useLocation();
  const isHome = pathname === "/";

  const hideFooter =
    pathname.startsWith("/dashboard") || pathname.startsWith("/upload");

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className={`flex-1 ${isHome ? "" : "bg-[#F6F8FB]"}`}>
        <ScrollToTop />

        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogDetailPage />} />

          {/* Protected */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/consumption" element={<ConsumptionDetail />} />
            <Route path="/dashboard/yekdem" element={<YekdemDetail />} />
            <Route path="/dashboard/invoice-detail" element={<InvoiceDetail />} />
            <Route path="/dashboard/profile" element={<ProfilePage />} />
            <Route path="/dashboard/files" element={<FilesPage />} />
            <Route path="/dashboard/invoices" element={<InvoiceHistory />} />
            <Route path="/dashboard/invoices/:sub/:year/:month" element={<InvoiceSnapshotDetail />} />
            <Route path="/dashboard/ptf" element={<PtfDetail />} />
            <Route path="/dashboard/yekdem-mahsup" element={<YekdemMahsupDetail />} />
            <Route path="/dashboard/charts" element={<ChartsPage />} />
            <Route path="/dashboard/alerts" element={<AlertsPage />} />

            {/* Admin parent route */}
            <Route path="/dashboard/admin" element={<AdminRoute />}>
              <Route index element={<AdminHome />} />
              <Route path="user-integrations" element={<UserIntegrationsAdmin />} />
              <Route path="subscription-settings" element={<SubscriptionSettingsAdmin />} />
              <Route path="subscription-yekdem" element={<SubscriptionYekdemAdmin />} />
              <Route path="distribution-tariff" element={<DistributionTariffAdmin />} />
              <Route path="posts" element={<PostsAdmin />} />
              <Route path="owner-subscriptions" element={<OwnerSubscriptionsAdmin />} />
              <Route path="notification-channels" element={<NotificationChannelsAdmin />} />
              <Route path="user-phone-numbers" element={<UserPhoneNumbersAdmin />} />
              <Route path="sms-logs" element={<SmsLogsAdmin />} />
              <Route path="reactive-alerts" element={<ReactiveAlertsAdmin />} />
              <Route path="notification-events" element={<NotificationEventsAdmin />} />
              <Route path="epias-ptf" element={<EpiasPtfAdmin />} />
              <Route path="invoice-snapshots" element={<InvoiceSnapshotsAdmin />} />
              <Route path="monthly-overview" element={<MonthlyOverviewAdmin />} />
              <Route path="contact-messages" element={<ContactMessagesAdmin />} />
            </Route>
          </Route>
        </Routes>
      </main>

      {!hideFooter && <Footer variant={isHome ? "gradient" : "light"} />}
    </div>
  );
}
