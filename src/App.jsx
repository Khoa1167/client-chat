import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { CallProvider } from './context/CallContext';
import { GroupCallProvider } from './context/GroupCallContext';
import { ThemeProvider } from './context/ThemeContext';
import Login       from './components/Auth/Login';
import Register    from './components/Auth/Register';
import SetNickname from './components/Auth/SetNickname';
import ChatPage    from './pages/ChatPage';
import AdminPage   from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import ToastContainer from './components/common/ToastContainer';
import FullPageLoading from './components/common/FullPageLoading';

const PrivateRoute = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  return user ? (
    <SocketProvider>
      <CallProvider>
        <GroupCallProvider>
          <Outlet />
        </GroupCallProvider>
      </CallProvider>
    </SocketProvider>
  ) : <Navigate to="/login" state={{ from: location }} replace />;
};

// Đã đăng nhập mà quay lại /login hoặc /register (vd bấm back trình duyệt) thì đẩy thẳng vào app
// thay vì hiện lại form — session vẫn còn hiệu lực, không phải đã đăng xuất.
const PublicOnlyRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoading />;
  return user ? <Navigate to="/" replace /> : children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return user.role === 'admin' ? children : <Navigate to="/" replace />;
};

export default function App() {
  // Nút back cứng Android — thiếu xử lý này sẽ thoát app thay vì quay lại màn trước. Trên web
  // thường, @capacitor/app tự fallback không làm gì nên gọi thẳng không cần check platform.
  useEffect(() => {
    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        CapacitorApp.exitApp();
      }
    });
    return () => { listenerPromise.then(listener => listener.remove()); };
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastContainer />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={
              <PublicOnlyRoute>
                <Login />
              </PublicOnlyRoute>
            } />
            <Route path="/register" element={
              <PublicOnlyRoute>
                <Register />
              </PublicOnlyRoute>
            } />
            <Route path="/set-nickname" element={<SetNickname />} />
            <Route element={<PrivateRoute />}>
              <Route path="/admin" element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              } />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/" element={<ChatPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
