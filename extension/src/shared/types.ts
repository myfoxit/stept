// ─── Core Types ─────────────────────────────────────────────
// Extracted from the runtime shape of objects in background.js, content.js,
// and sidepanel.js. All fields are based on actual usage, not aspirational.

export interface ElementInfo {
  tagName: string;
  id: string | null;
  className: string | null;
  text: string;
  href: string | null;
  type: string | null;
  name: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  role: string | null;
  title: string | null;
  alt: string | null;
  associatedLabel: string | null;
  parentText: string | null;
  testId: string | null;
  elementRect: { x: number; y: number; width: number; height: number };
  // Enhanced capture fields
  selector: string | null;
  xpath: string | null;
  dataId: string | null;
  dataRole: string | null;
  ariaDescription: string | null;
  ariaLabelledby: string | null;
  parentChain: ParentChainEntry[] | null;
  siblingText: string[] | null;
  isInIframe: boolean;
  iframeSrc: string | null;
}

export interface ParentChainEntry {
  tag: string;
  id: string | null;
  role: string | null;
  ariaLabel: string | null;
  testId: string | null;
  className: string | null;
}

export interface CapturedStep {
  stepNumber: number;
  actionType: 'Left Click' | 'Right Click' | 'Double Click' | 'Type' | 'Key' | 'Select' | 'Navigate';
  description: string;
  pageTitle: string;
  url: string;
  timestamp: number;
  screenshotDataUrl?: string | null;
  screenshotRelativeMousePosition?: { x: number; y: number } | null;
  screenshotSize?: { width: number; height: number } | null;
  globalPosition?: { x: number; y: number };
  relativePosition?: { x: number; y: number };
  clickPosition?: { x: number; y: number };
  windowSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  elementInfo?: ElementInfo;
  domSnapshot?: string;
  textTyped?: string;
}

export interface ExtensionState {
  isAuthenticated: boolean;
  isRecording: boolean;
  isPaused: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: UserInfo | null;
  userProjects: Project[];
  selectedProjectId: string | null;
  steps: CapturedStep[];
  recordingStartTime: number | null;
  stepCount: number;
}

export interface UserInfo {
  id: string;
  email: string;
  name?: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface GuideStep {
  title?: string;
  description?: string;
  action_type?: string;
  selector?: string;
  xpath?: string;
  element_role?: string;
  element_text?: string;
  element_info?: Partial<ElementInfo>;
  expected_url?: string;
  url?: string;
  screenshot_url?: string;
  screenshot_relative_position?: { x: number; y: number };
  screenshot_size?: { width: number; height: number };
}

export interface Guide {
  id: string;
  title?: string;
  workflow_id?: string;
  workflowId?: string;
  steps: GuideStep[];
}

export interface ActiveGuideState {
  guide: Guide;
  tabId: number;
  currentIndex: number;
  stepStatus?: string;
  sessionId?: string;
  targetUrl?: string | null;
}

export interface ContextMatch {
  resource_type: 'workflow' | 'document';
  resource_id: string;
  resource_name: string;
  match_type: string;
}

export interface RedactionSettings {
  enabled: boolean;
  emails: boolean;
  names: boolean;
  numbers: boolean;
  formFields: boolean;
  longText: boolean;
  images: boolean;
}

export interface BuildConfig {
  mode: 'self-hosted' | 'cloud';
  cloudApiUrl: string;
  defaultApiUrl: string;
}
