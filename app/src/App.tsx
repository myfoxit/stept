// ────────────────────────────────────────────
// File: src/App.tsx  (unused – main.tsx is the entry point)
// ────────────────────────────────────────────
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { FolderView } from '@/pages/folder-view';
import { WorkflowView } from '@/pages/workflow-view';
import { ProjectSettingsPage } from '@/pages/project-settings';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/documents/all" replace />} />
        <Route path="settings" element={<ProjectSettingsPage />} />
        <Route path="folder/:folderId" element={<FolderView />} />
        <Route path="workflow/:workflowId" element={<WorkflowView />} />
      </Route>
    </Routes>
  );
}
