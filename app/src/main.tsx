// src/index.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import './i18n'; // i18n must init before app renders
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
import { SsoSettingsPage } from "./pages/sso-settings";
import { JoinProjectPage } from "./pages/join-project";
import { FolderView } from "@/pages/folder-view";
import { WorkflowView } from "@/pages/workflow-view";
import { DocumentGalleryPage } from "@/pages/document-gallery";
import { ChatProvider } from "@/components/Chat/ChatContext";
import { ChatPanel } from "@/components/Chat/ChatPanel";
import { SpotlightProvider } from "@/components/spotlight/SpotlightProvider";
import { PublicWorkflowPage } from "@/pages/public-workflow";
import { EmbedWorkflowPage } from "@/pages/embed-workflow";
import { PublicDocumentPage } from "@/pages/public-document";
import { SharedWithMePage } from "@/pages/shared-with-me";

import { TeamPage } from "@/pages/team";
import { KnowledgeBasePage } from "@/pages/knowledge-base";
import { AuditLogPage } from "@/pages/audit-log";
import { VideoImportPage } from "@/pages/video-import";
import { AnalyticsDashboardPage } from "@/pages/analytics-dashboard";
import { VerificationSettingsPage } from "@/pages/verification-settings";
import TrashPage from "@/pages/trash";
import { DatabaseViewPage } from "@/pages/database-view";
import NotFoundPage from "@/pages/NotFoundPage";
import VerifyPage from "@/pages/VerifyPage";
import { DeviceConsentPage } from "@/pages/device-consent";

const queryClient = new QueryClient();

/** Hide ChatPanel on embed and public routes where it shouldn't appear */
function ChatPanelGuard() {
  const { pathname } = useLocation();
  if (pathname.includes('/embed') || pathname.startsWith('/public/')) return null;
  return <ChatPanel />;
}

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
                        path="/projects/:projectId/settings/sso"
                        element={<SsoSettingsPage />}
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
                      <Route path="/team" element={<TeamPage />} />
                      <Route
                        path="/knowledge"
                        element={<KnowledgeBasePage />}
                      />
                      <Route path="/audit" element={<AuditLogPage />} />
                      <Route path="/video-import" element={<VideoImportPage />} />
                      <Route
                        path="/analytics"
                        element={<AnalyticsDashboardPage />}
                      />
                      <Route
                        path="/projects/:projectId/settings/verification"
                        element={<VerificationSettingsPage />}
                      />
                      <Route path="/trash" element={<TrashPage />} />
                      <Route
                        path="/database/:databaseId"
                        element={<DatabaseViewPage />}
                      />
                    </Route>
                    <Route path="login" element={<LoginPage />} />
                    <Route path="verify" element={<VerifyPage />} />
                    <Route path="/auth/device-consent" element={<DeviceConsentPage />} />
                    <Route path="/join-project" element={<JoinProjectPage />} />
                    <Route
                      path="/public/workflow/:token"
                      element={<PublicWorkflowPage />}
                    />
                    <Route
                      path="/public/workflow/:token/embed"
                      element={<EmbedWorkflowPage />}
                    />
                    <Route
                      path="/public/document/:token"
                      element={<PublicDocumentPage />}
                    />

                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                  <ChatPanelGuard />
                </SpotlightProvider>
              </BrowserRouter>
            </ChatProvider>
          </ProjectProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
