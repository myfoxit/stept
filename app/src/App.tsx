// ────────────────────────────────────────────
// File: src/App.tsx
// ────────────────────────────────────────────
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectLayout } from './components/ProjectLayout';
import { TablesPage } from './pages/TablesPage';
import { TablePage } from './pages/TablePage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentPage } from './pages/DocumentPage';
import { DashboardPage } from './pages/DashboardPage';
import { RecordingsPage } from './pages/RecordingsPage';
import { FolderView } from '@/pages/folder-view';
import { WorkflowView } from '@/pages/workflow-view';
import { ProjectSettingsPage } from '@/pages/project-settings';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        
        <Route path="project/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="tables" replace />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="table/:tableId" element={<TablePage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="document/:docId" element={<DocumentPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
          <Route path="folder/:folderId" element={<FolderView />} />
          <Route path="workflow/:workflowId" element={<WorkflowView />} />
        </Route>
      </Route>
    </Routes>
  );
}