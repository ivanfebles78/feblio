import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import Landing from './pages/Landing'
import AdminDashboard from './pages/AdminDashboard'
import EmpresaDashboard from './pages/EmpresaDashboard'
import ClienteDashboard from './pages/ClienteDashboard'
import PublicIntakeForm from './pages/PublicIntakeForm'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/form/:token" element={<PublicIntakeForm />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allow={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/empresa"
            element={
              <ProtectedRoute allow={['empresa']}>
                <EmpresaDashboard />
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
      </BrowserRouter>
    </AuthProvider>
  )
}
