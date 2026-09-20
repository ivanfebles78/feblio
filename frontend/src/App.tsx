import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { OnboardingRoute } from './components/OnboardingRoute'
import { EmpresaGate } from './components/EmpresaGate'
import { LoadingScreen } from './components/LoadingScreen'
import Landing from './pages/Landing'
import AdminDashboard from './pages/AdminDashboard'
import EmpresaDashboard from './pages/EmpresaDashboard'
import ClienteDashboard from './pages/ClienteDashboard'
import PublicIntakeForm from './pages/PublicIntakeForm'
import { LEGAL_ROUTES } from './lib/legal'
import { CLIENT_LINK_BASE, FORGOT_PASSWORD_PATH, ONBOARDING_BASE, REGISTER_PATH, RESET_PASSWORD_PATH, WELCOME_PATH } from './lib/routing'

// Carga diferida: el wizard y las páginas legales no pesan en el bundle inicial
const OnboardingPage = lazy(() => import('./pages/onboarding/OnboardingPage'))
const Terminos = lazy(() => import('./pages/legal/Terminos'))
const Privacidad = lazy(() => import('./pages/legal/Privacidad'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const WelcomePage = lazy(() => import('./pages/WelcomePage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const SolicitudCliente = lazy(() => import('./pages/SolicitudCliente'))

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path={REGISTER_PATH} element={<RegisterPage />} />
            <Route path={FORGOT_PASSWORD_PATH} element={<ForgotPasswordPage />} />
            <Route path={RESET_PASSWORD_PATH} element={<ResetPasswordPage />} />
            <Route path="/form/:token" element={<PublicIntakeForm />} />
            <Route path={`${CLIENT_LINK_BASE}/:token`} element={<SolicitudCliente />} />
            <Route path={LEGAL_ROUTES.terms} element={<Terminos />} />
            <Route path={LEGAL_ROUTES.privacy} element={<Privacidad />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allow={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/empresa/*"
              element={
                <ProtectedRoute allow={['empresa']}>
                  <EmpresaGate mode="dashboard">
                    <EmpresaDashboard />
                  </EmpresaGate>
                </ProtectedRoute>
              }
            />
            <Route
              path={WELCOME_PATH}
              element={
                <ProtectedRoute allow={['empresa']}>
                  <EmpresaGate mode="welcome">
                    <WelcomePage />
                  </EmpresaGate>
                </ProtectedRoute>
              }
            />
            <Route
              path={`${ONBOARDING_BASE}/:step?`}
              element={
                <OnboardingRoute>
                  <OnboardingPage />
                </OnboardingRoute>
              }
            />
            <Route
              path="/integraciones/callback"
              element={
                <ProtectedRoute allow={['empresa']}>
                  <OAuthCallback />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente"
              element={
                <ProtectedRoute allow={['cliente']}>
                  <ClienteDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
