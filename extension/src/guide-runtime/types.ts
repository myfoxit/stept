// Guide-runtime types — self-contained for content script bundle

export interface IframeOffset { x: number; y: number; }
export interface SearchRoot { root: Document | ShadowRoot; iframeOffset: IframeOffset; }

export interface ParentChainEntry {
  tag?: string;
  id?: string | null;
  role?: string | null;
  ariaLabel?: string | null;
  testId?: string | null;
  className?: string | null;
}

export interface SelectorTree {
  selectors?: string[];
  prevSiblingSelectors?: string[];
  nextSiblingSelectors?: string[];
  parent?: SelectorTree | null;
}

export interface ElementInfo {
  tagName?: string;
  text?: string;
  content?: string;
  id?: string | null;
  className?: string | null;
  placeholder?: string | null;
  ariaLabel?: string | null;
  role?: string | null;
  type?: string | null;
  name?: string | null;
  href?: string | null;
  testId?: string | null;
  selector?: string | null;
  selectorSet?: string[] | null;
  selectorTree?: SelectorTree | null;
  xpath?: string | null;
  parentChain?: ParentChainEntry[] | null;
  parentText?: string | null;
  stableClassName?: string | null;
}

export interface GuideStep {
  title?: string;
  description?: string;
  action_type?: string;
  expected_url?: string;
  step_number?: number;
  selector?: string;
  xpath?: string;
  element_role?: string;
  element_text?: string;
  element_info?: ElementInfo;
}

export interface Guide {
  id?: string;
  title?: string;
  workflow_id?: string;
  workflowId?: string;
  steps?: GuideStep[];
}

export interface FindResult {
  element?: Element;
  rect?: AdjustedRect;
  iframeOffset?: IframeOffset;
  confidence: number;
  method: string;
  requiresManualInteraction?: boolean;
}

export interface AdjustedRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}
