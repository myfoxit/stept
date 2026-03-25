# Stept Replay Fix Plan: Port from Tango

Based on detailed analysis of Tango's working replay system vs Stept's broken implementation.

## Executive Summary

Stept's guide replay has **4 critical architectural gaps** compared to Tango's robust system:

1. **Navigate steps don't auto-advance** - Missing URL-based step completion
2. **Mark as complete not working** - No completion UI in tooltips  
3. **Wrong elements highlighted** - Scoring thresholds too permissive
4. **Elements not found after navigation** - Missing re-injection coordination

## Core Architectural Differences

### Tango's Working Architecture:
- **Route-based state management** with cleanup on route changes
- **Multi-signal element scoring** with minimum threshold > 4 points
- **Event-driven step advancement** with double-advance protection
- **Completion UI integrated** into tooltip system
- **Smart re-injection** on navigation with background coordination

### Stept's Broken Architecture:
- **Manual step management** with limited auto-advance
- **Scoring system** but wrong thresholds (30% minimum vs fixed threshold)
- **Missing completion buttons** in tooltips (marked as "non-interactive")
- **Navigation handling** exists but missing URL-step matching logic
- **Re-injection** works but timing issues with step synchronization

## Specific Bug Analysis

### Bug 1: Navigate Steps Not Auto-Advancing

**Current Broken Code** (`guide-runtime/index.ts:1782-1796`):
```javascript
// Navigate / new-tab steps have no element to highlight — auto-advance
const isNavigateStep = actionType === 'navigate';
if (isNavigateStep) {
  chrome.runtime.sendMessage({
    type: 'GUIDE_STEP_CHANGED',
    currentIndex: index,
    totalSteps: this.steps.length,
    stepStatus: 'completed',  // ❌ WRONG - marks as completed but doesn't advance
  }).catch(() => {});
  // Small delay so the sidepanel can update, then advance
  await new Promise<void>((r) => setTimeout(r, 300));
  if (this._stepSeq !== seq) return;
  this.showStep(index + 1);  // ❌ This works, but...
  return;
}
```

**Problem**: The `stepStatus: 'completed'` message tells the background the current step is done, but the background doesn't update its internal state to advance. When the next `showStep(index + 1)` calls `_handleUrlChange`, the background thinks we're still on the old step.

**Tango's Working Pattern** (from `content-entry.js`):
```javascript
// URL change triggers immediate step evaluation and advancement
function _handleUrlChange(newUrl, oldUrl) {
  const matchingStepIndex = _findStepForUrl(newUrl);
  if (matchingStepIndex !== -1 && matchingStepIndex !== this.currentIndex) {
    // Auto-advance to the matching step
    chrome.runtime.sendMessage({
      type: 'GUIDE_URL_CHANGED',
      oldUrl,
      newUrl,
      fromStep: this.currentIndex,
      toStep: matchingStepIndex
    });
    this.showStep(matchingStepIndex);
  }
}
```

### Bug 2: Mark as Complete Not Working

**Current Broken Code** (`guide-runtime/index.ts:1949-1952`):
```javascript
// Non-interactive — all actions happen via the side panel
tooltip.style.pointerEvents = "none";  // ❌ WRONG - completely disables interaction
```

**Problem**: Stept's tooltips are marked as non-interactive, so there's no way for users to manually mark steps as complete. The comment says "all actions happen via the side panel" but the side panel doesn't have a "mark complete" button either.

**Tango's Working Pattern**: Tooltips include interactive elements for step completion and navigation.

### Bug 3: Wrong Elements Highlighted  

**Current Broken Code** (`guide-runtime/index.ts:940-944`):
```javascript
// Minimum score threshold (Tango's ratio approach)
const maxPossible = calculateMaxPossible(step);
const minRequired = Math.floor(maxPossible * 0.3); // ❌ WRONG - too permissive

if (best.score < minRequired) return null;
```

**Problem**: Stept uses 30% of maximum possible score, which is too permissive. This causes weak matches to be highlighted.

**Tango's Working Pattern** (`element-finding.js:12079`):
```javascript
return o.score > 4 ? o.element : null;  // Fixed threshold of 4+ points
```

### Bug 4: Elements Not Found After Navigation

**Current Issue**: The URL change detection works, but there's a race condition between:
1. Background script updating `activeGuideState.currentIndex`
2. Content script getting re-injected with new step index
3. Step finding/highlighting happening before DOM is ready

**Root Cause** (`background/index.ts:982-989`):
```javascript
try {
  const resp = await chrome.tabs.sendMessage(details.tabId, {
    type: 'GUIDE_GOTO', stepIndex: activeGuideState.currentIndex,  // ❌ May be stale
  });
  if (resp && (resp as any).success) {
    return; // guide handled it, don't re-inject
  }
} catch {} // no listener -- need full inject
```

**Problem**: `activeGuideState.currentIndex` might not have been updated by the `GUIDE_STEP_CHANGED` message yet, so the wrong step index is sent.

## Detailed Fix Plan

### Fix 1: Navigate Step Auto-Advancement

**File**: `extension/src/guide-runtime/index.ts`
**Function**: `showStep()`

**Current Code** (lines 1782-1796):
```javascript
// Navigate / new-tab steps have no element to highlight — auto-advance
const isNavigateStep = actionType === 'navigate';
if (isNavigateStep) {
  chrome.runtime.sendMessage({
    type: 'GUIDE_STEP_CHANGED',
    currentIndex: index,
    totalSteps: this.steps.length,
    stepStatus: 'completed',
  }).catch(() => {});
  // Small delay so the sidepanel can update, then advance
  await new Promise<void>((r) => setTimeout(r, 300));
  if (this._stepSeq !== seq) return;
  this.showStep(index + 1);
  return;
}
```

**Replace With**:
```javascript
// Navigate / new-tab steps have no element to highlight — auto-advance
const isNavigateStep = actionType === 'navigate';
if (isNavigateStep) {
  const nextIndex = index + 1;
  
  // Immediately notify background of advancement BEFORE calling showStep
  chrome.runtime.sendMessage({
    type: 'GUIDE_STEP_CHANGED',
    currentIndex: nextIndex,  // ✅ Next step, not current
    totalSteps: this.steps.length,
    stepStatus: 'active',     // ✅ Next step is now active
    previousStep: index,      // ✅ Track where we came from
    isAutoAdvance: true,      // ✅ Flag for background to handle differently
  }).catch(() => {});
  
  // Brief delay for background state update, then advance locally
  await new Promise<void>((r) => setTimeout(r, 100));
  if (this._stepSeq !== seq) return;
  
  if (nextIndex >= this.steps.length) {
    this.stop();
    return;
  }
  
  this.showStep(nextIndex);
  return;
}
```

**File**: `extension/src/background/index.ts`
**Function**: Message handler for `GUIDE_STEP_CHANGED`

**Current Code** (lines 689-700):
```javascript
case 'GUIDE_STEP_CHANGED': {
  if (activeGuideState) {
    setActiveGuideState({
      ...activeGuideState,
      currentIndex: message.currentIndex,
      stepStatus: message.stepStatus || 'active',
    });
  }
  notifyGuideStateUpdate();
  sendResponse({ success: true });
  break;
}
```

**Replace With**:
```javascript
case 'GUIDE_STEP_CHANGED': {
  if (activeGuideState) {
    setActiveGuideState({
      ...activeGuideState,
      currentIndex: message.currentIndex,
      stepStatus: message.stepStatus || 'active',
    });
    
    // If this was auto-advance from navigate step, update immediately
    if (message.isAutoAdvance) {
      debugLog(`Auto-advanced from step ${message.previousStep} to ${message.currentIndex}`);
    }
  }
  notifyGuideStateUpdate();
  sendResponse({ success: true });
  break;
}
```

### Fix 2: Add Mark as Complete Button

**File**: `extension/src/guide-runtime/index.ts`
**Function**: `_createTooltip()`

**Current Code** (lines 1938-1953):
```javascript
_createTooltip(step: GuideStep, _urlMismatch: boolean, _obstructor: Element | null): HTMLDivElement {
  const tooltip = document.createElement("div");
  tooltip.className = "guide-tooltip";

  // Tango-style dark pill: coral dot + step instruction text
  const stepText = step.title || step.description || `Step ${this.currentIndex + 1}`;
  tooltip.innerHTML = `
    <span class="guide-tooltip-dot"></span>
    <span class="guide-tooltip-text">${this._esc(stepText)}</span>
  `;

  // Non-interactive — all actions happen via the side panel
  tooltip.style.pointerEvents = "none";

  return tooltip;
}
```

**Replace With**:
```javascript
_createTooltip(step: GuideStep, urlMismatch: boolean, obstructor: Element | null): HTMLDivElement {
  const tooltip = document.createElement("div");
  tooltip.className = "guide-tooltip";

  const stepText = step.title || step.description || `Step ${this.currentIndex + 1}`;
  const canMarkComplete = !urlMismatch && !obstructor;
  const actionType = (step.action_type || '').toLowerCase();
  const isInteractiveStep = actionType.includes('click') || actionType.includes('type') || actionType.includes('select');
  
  // Show mark complete button for interactive steps when element is found
  const buttonHtml = canMarkComplete && isInteractiveStep ? `
    <button class="guide-tooltip-complete" type="button" title="Mark this step as complete">
      ✓ Complete
    </button>
  ` : '';
  
  tooltip.innerHTML = `
    <div class="guide-tooltip-content">
      <span class="guide-tooltip-dot"></span>
      <span class="guide-tooltip-text">${this._esc(stepText)}</span>
    </div>
    ${buttonHtml}
  `;

  // Enable interaction for complete button
  if (buttonHtml) {
    tooltip.style.pointerEvents = "auto";
    
    const completeBtn = tooltip.querySelector('.guide-tooltip-complete') as HTMLButtonElement;
    if (completeBtn) {
      completeBtn.onclick = (e) => {
        e.stopPropagation();
        this._handleManualComplete();
      };
    }
  } else {
    tooltip.style.pointerEvents = "none";
  }

  return tooltip;
}
```

**Add New Method**:
```javascript
_handleManualComplete(): void {
  if (this._advancing) return; // Prevent double-advance
  this._advancing = true;
  
  const nextIndex = this.currentIndex + 1;
  
  // Notify background immediately
  chrome.runtime.sendMessage({
    type: 'GUIDE_STEP_CHANGED',
    currentIndex: nextIndex,
    totalSteps: this.steps.length,
    stepStatus: 'active',
    isManualComplete: true,
  }).catch(() => {});

  // Clear current step handlers
  this._removeClickHandler();
  this._disconnectCompletionObserver();
  
  if (nextIndex >= this.steps.length) {
    this.stop();
    return;
  }
  
  setTimeout(() => this.showStep(nextIndex), 200);
}
```

**Add CSS** to styles section (around line 950):
```css
.guide-tooltip-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.guide-tooltip-complete {
  margin-left: 8px;
  margin-right: -4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.guide-tooltip-complete:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.4);
}

.guide-tooltip-complete:active {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(0.95);
}
```

### Fix 3: Stricter Element Scoring

**File**: `extension/src/guide-runtime/index.ts`
**Function**: `findElementByScoring()`

**Current Code** (lines 940-944):
```javascript
// Minimum score threshold (Tango's ratio approach)
// Calculate max possible score for this step's data
const maxPossible = calculateMaxPossible(step);
const minRequired = Math.floor(maxPossible * 0.3); // 30% minimum

if (best.score < minRequired) return null;
```

**Replace With**:
```javascript
// Use Tango's fixed threshold approach for reliability
const MINIMUM_SCORE = 4; // Tango's proven threshold
const FALLBACK_RATIO = 0.5; // Only if step has minimal data

// Calculate max possible score for this step's data
const maxPossible = calculateMaxPossible(step);
let minRequired = MINIMUM_SCORE;

// Fallback for steps with very limited data (max possible < 8)
if (maxPossible < 8) {
  minRequired = Math.floor(maxPossible * FALLBACK_RATIO);
}

if (best.score < minRequired) {
  debugLog(`Element score ${best.score} below minimum ${minRequired} (maxPossible: ${maxPossible})`);
  return null;
}

debugLog(`Found element with score ${best.score}/${maxPossible} (threshold: ${minRequired}), wins: ${best.wins.join(',')}`);
```

### Fix 4: Fix Navigation Re-injection Race Condition

**File**: `extension/src/background/index.ts`
**Function**: Navigation listener (lines 977-994)

**Current Code**:
```javascript
try {
  await new Promise((r) => setTimeout(r, 300)); // brief wait for DOM hydration
  // Try to tell existing guide to jump to the right step (no restart)
  try {
    const resp = await chrome.tabs.sendMessage(details.tabId, {
      type: 'GUIDE_GOTO', stepIndex: activeGuideState.currentIndex,
    });
    if (resp && (resp as any).success) {
      debugLog('Guide already running, sent GOTO');
      return; // guide handled it, don't re-inject
    }
  } catch {} // no listener -- need full inject
  await _injectGuideNow(details.tabId, activeGuideState.guide, activeGuideState.currentIndex);
} catch (e) {
  debugLog('Guide re-inject on navigation failed:', e);
}
```

**Replace With**:
```javascript
try {
  await new Promise((r) => setTimeout(r, 300)); // brief wait for DOM hydration
  
  // Get the CURRENT step index at time of navigation (avoid stale reads)
  const currentStepIndex = activeGuideState.currentIndex;
  debugLog(`Re-injecting guide at step ${currentStepIndex} after navigation to ${details.url}`);
  
  // Try to tell existing guide to jump to the right step (no restart)
  try {
    const resp = await chrome.tabs.sendMessage(details.tabId, {
      type: 'GUIDE_GOTO', 
      stepIndex: currentStepIndex,
      forceRefresh: true, // Tell content script this is post-navigation
    });
    if (resp && (resp as any).success) {
      debugLog('Guide already running, sent GOTO to step', currentStepIndex);
      return;
    }
  } catch (e) {
    debugLog('GUIDE_GOTO failed, full re-inject needed:', e);
  }
  
  // Full re-injection with current step
  await _injectGuideNow(details.tabId, activeGuideState.guide, currentStepIndex);
  debugLog('Full guide re-injection completed');
} catch (e) {
  debugLog('Guide re-inject on navigation failed:', e);
}
```

**File**: `extension/src/guide-runtime/index.ts`
**Function**: Message handler (add new case)

**Add After Line ~2283** (in message handler):
```javascript
case 'GUIDE_GOTO': {
  const stepIndex = message.stepIndex;
  const forceRefresh = message.forceRefresh;
  
  if (stepIndex >= 0 && stepIndex < this.steps.length) {
    debugLog(`GUIDE_GOTO: Jumping to step ${stepIndex}${forceRefresh ? ' (post-navigation)' : ''}`);
    
    // If this is post-navigation refresh, ensure we're not in a stale state
    if (forceRefresh) {
      this._lastKnownUrl = window.location.href;
    }
    
    this.showStep(stepIndex);
    sendResponse({ success: true, currentStep: stepIndex });
  } else {
    debugLog(`GUIDE_GOTO: Invalid step index ${stepIndex}`);
    sendResponse({ success: false, error: 'Invalid step index' });
  }
  return true;
}
```

## Testing Strategy

After implementing these fixes, test the specific scenarios:

### Test 1: Navigate Step Auto-Advancement
1. Create a guide with steps: Click → Navigate → Click
2. Start guide, complete first click step
3. **Expected**: Navigate step should auto-complete and advance to final click step
4. **Previously**: Navigate step would get stuck

### Test 2: Mark as Complete Button
1. Create a guide with a click step that's hard to find
2. Start guide, should see "✓ Complete" button in tooltip
3. Click the complete button
4. **Expected**: Should advance to next step immediately
5. **Previously**: No way to manually advance

### Test 3: Better Element Highlighting
1. Create a guide targeting a common element like "Submit" button
2. If page has multiple submit buttons, should highlight the right one
3. **Expected**: Only highlight if confidence score > 4 points
4. **Previously**: Would highlight wrong element with low confidence

### Test 4: Navigation Persistence
1. Create multi-page guide: Step 1 on page A → Navigate to page B → Step 2 on page B
2. Complete step 1, navigate to page B
3. **Expected**: Guide should immediately show step 2 on page B
4. **Previously**: Step would get lost or show wrong step

## Risk Assessment

**Low Risk Changes**:
- Navigate step auto-advancement (isolated to one code path)
- Element scoring threshold (just changes numbers)

**Medium Risk Changes**:
- Mark as complete button (new UI interaction)
- Navigation re-injection (touches timing-sensitive code)

**Mitigation**:
- Add extensive logging for debugging
- Feature flag the mark complete button
- Test thoroughly on single-page vs multi-page guides

## Implementation Order

1. **Fix 3** (Element Scoring) - Safest change, immediate improvement
2. **Fix 1** (Navigate Auto-Advancement) - High impact, low complexity
3. **Fix 4** (Navigation Re-injection) - Complex but critical for multi-page
4. **Fix 2** (Mark Complete Button) - New feature, implement last

This plan addresses the core architectural gaps that make Stept's replay system unreliable compared to Tango's robust implementation.