// src/index.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import { Layout } from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EditorPage from "./pages/EditorPage";
import { ProjectProvider } from "./providers/project-provider";
import LoginPage from "./pages/LoginPage";
import { AuthProvider } from "@/providers/auth-provider";
import RequireAuth from "@/components/RequireAuth";
import { ProjectSettingsPage } from "./pages/project-settings";
import { AiSettingsPage } from "./pages/ai-settings";
import { PrivacySettingsPage } from "./pages/privacy-settings";
import { IntegrationsSettingsPage } from "./pages/integrations-settings";
import { JoinProjectPage } from "./pages/join-project";
import { FolderView } from "@/pages/folder-view";
import { WorkflowView } from "@/pages/workflow-view";
import { DocumentGalleryPage } from "@/pages/document-gallery";
import { ChatProvider } from "@/components/Chat/ChatContext";
import { ChatPanel } from "@/components/Chat/ChatPanel";
import { SpotlightProvider } from "@/components/spotlight/SpotlightProvider";
import { PublicWorkflowPage } from "@/pages/public-workflow";
import { PublicDocumentPage } from "@/pages/public-document";
import { SharedWithMePage } from "@/pages/shared-with-me";
import { ContextLinksPage } from "@/pages/context-links";
import { TeamPage } from "@/pages/team";
import { KnowledgeBasePage } from "@/pages/knowledge-base";
import { AuditLogPage } from "@/pages/audit-log";
import { AnalyticsDashboardPage } from "@/pages/analytics-dashboard";
import TrashPage from "@/pages/trash";
import NotFoundPage from "@/pages/NotFoundPage";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProjectProvider>
            <ChatProvider>
              <BrowserRouter>
                <SpotlightProvider>
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
                      <Route
                        path="editor/:docId/:pageId"
                        element={<EditorPage />}
                      />
                      <Route
                        path="/projects/:projectId/settings"
                        element={<ProjectSettingsPage />}
                      />
                      <Route
                        path="/projects/:projectId/settings/ai"
                        element={<AiSettingsPage />}
                      />
                      <Route
                        path="/projects/:projectId/settings/privacy"
                        element={<PrivacySettingsPage />}
                      />
                      <Route
                        path="/projects/:projectId/settings/integrations"
                        element={<IntegrationsSettingsPage />}
                      />
                      <Route
                        path="/folder/:folderId"
                        element={<FolderView />}
                      />
                      <Route
                        path="/workflow/:workflowId"
                        element={<WorkflowView />}
                      />
                      <Route
                        path="/workflow/:workflowId/edit"
                        element={<WorkflowView />}
                      />
                      <Route
                        path="documents/:type"
                        element={<DocumentGalleryPage />}
                      />
                      <Route path="/shared" element={<SharedWithMePage />} />
                      <Route
                        path="/context-links"
                        element={<ContextLinksPage />}
                      />
                      <Route path="/team" element={<TeamPage />} />
                      <Route
                        path="/knowledge"
                        element={<KnowledgeBasePage />}
                      />
                      <Route path="/audit" element={<AuditLogPage />} />
                      <Route
                        path="/analytics"
                        element={<AnalyticsDashboardPage />}
                      />
                      <Route path="/trash" element={<TrashPage />} />
                    </Route>
                    <Route path="login" element={<LoginPage />} />
                    <Route path="/join-project" element={<JoinProjectPage />} />
                    <Route
                      path="/public/workflow/:token"
                      element={<PublicWorkflowPage />}
                    />
                    <Route
                      path="/public/document/:token"
                      element={<PublicDocumentPage />}
                    />

                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                  <ChatPanel />
                </SpotlightProvider>
              </BrowserRouter>
            </ChatProvider>
          </ProjectProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
