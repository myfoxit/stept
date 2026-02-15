// src/index.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { Layout } from '@/components/Layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { DocumentGalleryPage } from '@/pages/document-gallery';
import { ChatProvider } from '@/components/Chat/ChatContext';
import { ChatPanel } from '@/components/Chat/ChatPanel';
import { SpotlightProvider } from '@/components/spotlight/SpotlightProvider';
import { PublicWorkflowPage } from '@/pages/public-workflow';
import { PublicDocumentPage } from '@/pages/public-document';
import { SharedWithMePage } from '@/pages/shared-with-me';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProjectProvider>
          <ChatProvider>
            <SpotlightProvider>
            <BrowserRouter>
              <Routes>
                <Route
                  element={
                    <RequireAuth>
                      <Layout />
                    </RequireAuth>
                  }
                >
                  <Route index element={<DocumentGalleryPage />} />
                  <Route path="editor/:docId" element={<EditorPage />} />
                  <Route path="editor/:docId/:pageId" element={<EditorPage />} />
                  <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
                  <Route path="/folder/:folderId" element={<FolderView />} />
                  <Route path="/workflow/:workflowId" element={<WorkflowView />} />
                  <Route path="/workflow/:workflowId/edit" element={<WorkflowView />} />
                  <Route path="documents/:type" element={<DocumentGalleryPage />} />
                  <Route path="/shared" element={<SharedWithMePage />} />
                  <Route
                    path="/text-container/:containerId?"
                    element={<TextContainerEditor />}
                  />
                </Route>
                <Route path="login" element={<LoginPage />} />
                <Route path="/join-project" element={<JoinProjectPage />} />
                <Route path="/public/workflow/:token" element={<PublicWorkflowPage />} />
                <Route path="/public/document/:token" element={<PublicDocumentPage />} />
               
                <Route path="*" element={<p>Page not found</p>} />
              </Routes>
              <ChatPanel />
            </BrowserRouter>
          </SpotlightProvider>
          </ChatProvider>
        </ProjectProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
