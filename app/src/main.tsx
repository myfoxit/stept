// src/index.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { Layout } from '@/components/Layout';
import DataTablePage from '@/pages/DataTablePage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from './pages/DashboardPage';
import KanbanViewPage from './pages/KanbanViewPage';
import EditorPage from './pages/EditorPage';
import { TextContainerEditor } from './components/tiptap-templates/simple/text-container-editor';
import { ProjectProvider } from './providers/project-provider';
import LoginPage from './pages/LoginPage';
import { AuthProvider } from '@/providers/auth-provider';
import RequireAuth from '@/components/RequireAuth';
import { ProjectSettingsPage } from './pages/project-settings';
import { JoinProjectPage } from './pages/join-project';
import { FolderView } from '@/pages/folder-view';
import { WorkflowView } from '@/pages/workflow-view';
import { DocumentGalleryPage } from '@/pages/document-gallery';  // Add this

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProjectProvider>
          <BrowserRouter>
            <Routes>
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route index element={<DashboardPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="dashboard/:projectId" element={<DashboardPage />} />
                <Route path="tables/:tableId" element={<DataTablePage />} />
                <Route path="kanban/:tableId" element={<KanbanViewPage />} />
                <Route path="editor/:docId" element={<EditorPage />} />
                <Route path="editor/:docId/:pageId" element={<EditorPage />} />  {/* NEW: Support nested pages */}
                <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
                <Route path="/folder/:folderId" element={<FolderView />} />
                <Route path="/workflow/:workflowId" element={<WorkflowView />} />
                <Route path="/workflow/:workflowId/edit" element={<WorkflowView />} />  {/* NEW: Edit mode route */}
                <Route path="documents/:type" element={<DocumentGalleryPage />} />  {/* NEW: Gallery pages */}
                <Route
                  path="/text-container/:containerId?"
                  element={<TextContainerEditor />}
                />
              </Route>
              <Route path="login" element={<LoginPage />} />
              <Route path="/join-project" element={<JoinProjectPage />} />
             
              <Route path="*" element={<p>Page not found</p>} />
            </Routes>
          </BrowserRouter>
        </ProjectProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
