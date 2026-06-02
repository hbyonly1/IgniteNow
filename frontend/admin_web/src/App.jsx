import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import WorkspaceLayout from './pages/WorkspaceLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AnalyzePage from './pages/workspace/AnalyzePage.jsx';
import DashboardPage from './pages/workspace/DashboardPage.jsx';
import DramasPage from './pages/workspace/DramasPage.jsx';
import HighlightsPage from './pages/workspace/HighlightsPage.jsx';
import JobsPage from './pages/workspace/JobsPage.jsx';
import SettingsPage from './pages/workspace/SettingsPage.jsx';
import { getAdminUserRole, hasAdminAccessToken } from './auth.js';
import {
  canAccessWorkspaceModule,
  getDefaultWorkspacePath,
  getWorkspaceModuleById,
} from './workspaceModules.jsx';

function RequireWorkspaceAuth({ children }) {
  const location = useLocation();

  if (!hasAdminAccessToken()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function RequireWorkspaceRole({ moduleId, children }) {
  const role = getAdminUserRole();
  const module = getWorkspaceModuleById(moduleId);

  if (!canAccessWorkspaceModule(module, role)) {
    return <Navigate to={getDefaultWorkspacePath(role)} replace />;
  }

  return children;
}

function WorkspaceIndex() {
  return <Navigate to={getDefaultWorkspacePath(getAdminUserRole())} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/workspace"
        element={
          <RequireWorkspaceAuth>
            <WorkspaceLayout />
          </RequireWorkspaceAuth>
        }
      >
        <Route index element={<WorkspaceIndex />} />
        <Route
          path="dramas"
          element={
            <RequireWorkspaceRole moduleId="dramas">
              <DramasPage />
            </RequireWorkspaceRole>
          }
        />
        <Route
          path="analyze"
          element={
            <RequireWorkspaceRole moduleId="analyze">
              <AnalyzePage />
            </RequireWorkspaceRole>
          }
        />
        <Route
          path="analyze/jobs/:jobId"
          element={
            <RequireWorkspaceRole moduleId="analyze">
              <AnalyzePage />
            </RequireWorkspaceRole>
          }
        />
        <Route
          path="highlights"
          element={
            <RequireWorkspaceRole moduleId="highlights">
              <HighlightsPage />
            </RequireWorkspaceRole>
          }
        />
        <Route
          path="highlights/dramas/:dramaId"
          element={
            <RequireWorkspaceRole moduleId="highlights">
              <HighlightsPage />
            </RequireWorkspaceRole>
          }
        />
        <Route
          path="jobs"
          element={
            <RequireWorkspaceRole moduleId="jobs">
              <JobsPage />
            </RequireWorkspaceRole>
          }
        />
        <Route
          path="dashboard"
          element={
            <RequireWorkspaceRole moduleId="dashboard">
              <DashboardPage />
            </RequireWorkspaceRole>
          }
        />
        <Route
          path="settings"
          element={
            <RequireWorkspaceRole moduleId="settings">
              <SettingsPage />
            </RequireWorkspaceRole>
          }
        />
      </Route>
      <Route path="/admin/*" element={<Navigate to="/workspace" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
