# Guide Runtime Architecture Analysis

## Executive Summary

After analyzing Usertour (open-source DAP), browser-use (AI browser automation), Tango extension (process documentation), and our current stept guide-runtime, this document presents a comprehensive analysis of their approaches and proposes a hybrid architecture that combines the best of all four systems.

## 1. Usertour Analysis

### Element Finding Strategy
- **Method**: Uses sophisticated `finderX` function with multiple selector strategies
- **Cascade**: Primary selectors → parent chain comparison → precision scoring
- **Reliability**: High - uses multiple selectors per element, tries all until one succeeds
- **Innovation**: Parent chain validation ensures element is in correct context

### Step Execution Model  
- **Pattern**: Pure event-driven architecture via `UsertourElementWatcher`
- **Events**: `ELEMENT_FOUND`, `ELEMENT_CHANGED`, `ELEMENT_FOUND_TIMEOUT`
- **Retries**: Controlled via `setTimeout` (not `setInterval`)
- **Race Condition Handling**: Excellent - uses event emitters with proper cleanup

### Element Validation
- **Continuous**: Re-checks element validity after SPA re-renders
- **Methods**: `isVisible()` using floating-ui `hide()` middleware, DOM connectivity checks
- **Smart**: Only re-validates when DOM mutations are detected

### SPA Handling
- **URLMonitor**: Dedicated class with `popstate` + `hashchange` + 500ms polling
- **Recovery**: Automatically re-finds elements after URL/DOM changes
- **State Management**: Clean state transitions with proper event cleanup

### Multi-page Workflows  
- **URL-aware**: Each step can specify expected URL
- **Navigation**: Automatically navigates if current URL doesn't match step expectation
- **Skip-ahead**: Can detect when user has jumped ahead in the workflow

### Error Recovery
- **Timeouts**: Configurable, defaults to reasonable values
- **Fallbacks**: Multiple selector strategies provide graceful degradation
- **User Communication**: Clear error states communicated via events

### Click/Action Detection
- **Event-based**: Listens for actual DOM changes rather than just click events
- **Validation**: Checks that the intended action was actually completed
- **Debouncing**: Prevents rapid successive actions

### UI Rendering
- **Popper.js**: Sophisticated tooltip positioning with collision detection
- **Backdrop**: Multi-layer backdrop system for spotlight effect
- **Performance**: Uses transform/translate for smooth positioning updates

### Strengths
- **Architecture**: Clean event-driven design, excellent separation of concerns
- **Reliability**: Multiple fallback strategies for element finding
- **Performance**: Efficient DOM monitoring with minimal overhead
- **Maintainability**: Well-structured classes with clear responsibilities

### Weaknesses
- **Element Selection**: Limited to single CSS selector per element initially
- **Complex Setup**: Requires significant boilerplate for simple use cases
- **Heavy Dependencies**: Relies on multiple libraries (floating-ui, etc.)
- **Learning Curve**: Event-driven pattern requires understanding of async flows

## 2. Browser-use Analysis

### Element Finding Strategy
- **Method**: AI-driven element detection with multiple ranking criteria
- **Cascade**: Interactive detection → bounding box analysis → text matching
- **Reliability**: High for AI training, lower for consistent programmatic use
- **Innovation**: Sophisticated "clickable element" detection with accessibility scoring

### Step Execution Model
- **Pattern**: Watchdog pattern with CDP (Chrome DevTools Protocol)
- **Execution**: Direct element manipulation via Chrome APIs
- **Race Conditions**: Handled through timeout mechanisms and retry logic
- **Concurrency**: Controlled execution with proper session management

### Element Validation
- **Accessibility**: Uses Chrome's accessibility tree for validation
- **Occlusion**: Sophisticated checks for elements hidden behind other elements
- **Text Content**: Validates element text content matches expectations
- **Interactive State**: Verifies elements are actually clickable/interactable

### SPA Handling
- **DOM Observation**: Relies on CDP's DOM change events
- **Page Navigation**: Detects navigation via CDP Page domain events
- **Content Changes**: Re-evaluates page state after mutations

### Multi-page Workflows
- **Limited**: Primarily designed for single-page interactions
- **Navigation**: Can handle basic navigation but not complex workflows

### Error Recovery
- **Robust**: Multiple fallback strategies for element interaction
- **CDP Fallbacks**: If mouse events fail, falls back to JavaScript click
- **Timeout Handling**: Comprehensive timeout management with graceful degradation

### Click/Action Detection  
- **CDP Events**: Uses Chrome DevTools Protocol for reliable event detection
- **Verification**: Post-action validation to ensure actions completed
- **Human Simulation**: Events designed to closely mimic human interaction

### UI Rendering
- **No UI**: Designed for headless operation, no overlay rendering
- **Screenshot**: Can capture screenshots for debugging/verification

### Strengths
- **Element Detection**: Extremely sophisticated interactive element detection
- **CDP Integration**: Direct browser API access provides reliability
- **Action Verification**: Strong validation that actions actually completed
- **Accessibility**: Leverages browser's accessibility tree effectively

### Weaknesses  
- **No UI**: Lacks guided overlay for human users
- **AI Dependency**: Element detection optimized for AI, not human-recorded selectors
- **Complexity**: CDP integration requires significant browser expertise
- **Single-Purpose**: Designed for AI automation, not human guidance

## 3. Tango Extension Analysis

### Element Finding Strategy
- **Method**: Multi-selector approach with fallbacks (based on examination of network behavior)
- **Cascade**: CSS selector → data attributes → accessibility properties
- **Reliability**: High - appears to use multiple recorded selectors per element
- **Innovation**: Element capture system creates comprehensive selector sets

### Step Execution Model
- **Pattern**: Polling-based with user intervention capability
- **Execution**: Focuses on element highlighting rather than automatic progression
- **User Control**: Heavy emphasis on manual step completion
- **State Management**: Maintains guide state across page navigations

### Element Validation  
- **Visual**: Primarily relies on element visibility and positioning
- **User Feedback**: Allows users to mark steps complete if element not found
- **Screenshot Fallback**: Shows screenshots when elements cannot be located

### SPA Handling
- **URL Monitoring**: Tracks URL changes to maintain guide context
- **DOM Persistence**: Maintains guide overlay across dynamic content changes
- **Recovery**: Graceful handling of page transitions

### Multi-page Workflows
- **Excellent**: Core feature - tracks users across complex multi-page workflows
- **Breadcrumbs**: Shows progress through complex processes
- **URL Mapping**: Maps steps to specific URLs for accurate navigation tracking

### Error Recovery
- **User-Centric**: Provides "mark as complete" option when automatic detection fails
- **Screenshot Fallback**: Shows captured screenshots as guidance
- **Context Preservation**: Maintains workflow context even when elements change

### Click/Action Detection
- **Manual**: Primarily relies on user clicking "Next" or marking complete
- **Observation**: May monitor for expected page changes as validation

### UI Rendering
- **Light Overlay**: Dashed border highlights, small hint pills
- **Sidebar**: Primary UI in browser side panel, not page overlay
- **Minimal**: Non-intrusive page overlay with detailed sidebar

### Strengths
- **Multi-page**: Excellent handling of complex workflows across multiple pages
- **User Experience**: Light, non-intrusive overlay with detailed sidebar guidance  
- **Fallback Strategy**: Screenshot fallback when element detection fails
- **Context Awareness**: Maintains workflow context across navigation

### Weaknesses
- **Manual**: Heavy reliance on manual progression limits automation
- **Element Detection**: Appears to have limited sophisticated element finding
- **Performance**: May not be optimized for rapid step progression

## 4. Current Stept Analysis

### Element Finding Strategy  
- **Method**: 6-level cascade with title-hint fallback
- **Cascade**: selectorSet → selector → testid → role+text → tag+text → xpath → parentChain
- **Reliability**: Excellent - most comprehensive selector strategy of all systems
- **Innovation**: Title-hint extraction from step descriptions, selectorSet with 6-9 selectors per element

### Step Execution Model
- **Pattern**: setInterval polling with timeout handling  
- **Problems**: Race conditions, step jumping, unreliable state transitions
- **Performance**: Heavy CPU usage due to continuous polling
- **Concurrency**: Poor handling of concurrent step changes

### Element Validation
- **Limited**: Basic visibility and DOM connectivity checks
- **Missing**: No sophisticated occlusion detection or SPA re-render validation

### SPA Handling
- **Basic**: Simple URL monitoring with some smart skipping
- **Issues**: Doesn't handle SPA re-renders properly, can lose element references

### Multi-page Workflows  
- **Implemented**: Has URL matching and step skipping logic
- **Issues**: Race conditions cause unpredictable behavior across navigation

### Error Recovery
- **Good UI**: Shows not-found panels with helpful guidance
- **Limited Logic**: Doesn't attempt multiple recovery strategies

### Click/Action Detection
- **Comprehensive**: Handles clicks, input, dropdowns, file uploads
- **Issues**: Race conditions cause false advances and missed actions

### UI Rendering
- **Excellent**: Sophisticated spotlight/light modes, tooltip positioning
- **Polished**: Professional appearance with smooth animations
- **Flexible**: Multiple display modes (light/spotlight)

### Strengths
- **Element Finding**: Best-in-class multi-selector cascade with title hints
- **UI Quality**: Most polished and professional UI of all systems  
- **Feature Complete**: Handles complex interactions (dropdowns, file upload, etc.)
- **Display Modes**: Flexible light/spotlight modes for different use cases

### Weaknesses
- **Architecture**: Broken polling-based approach with severe race conditions
- **Reliability**: Steps can jump, close randomly, or fail to advance
- **Performance**: Heavy CPU usage from continuous polling
- **State Management**: Poor handling of concurrent operations and cleanup

## Proposed Hybrid Architecture

### Core Principles
1. **Event-Driven** (from Usertour): Replace polling with event-based element watching
2. **Sophisticated Element Finding** (from stept): Keep our 6-level cascade + title hints
3. **CDP Validation** (from browser-use): Use Chrome APIs for reliable element validation  
4. **Light UI + Sidebar** (from Tango): Minimal page overlay with rich sidebar detail
5. **Self-Healing** (innovation): LLM-assisted element recovery with selector updates

### Data Flow Architecture

```
User Starts Guide
       ↓
   GuideRunner
   (State Machine)
       ↓
Creates ElementWatcher
   (Event Emitter)
       ↓ 
ElementFinder tries cascade:
1. selectorSet (6-9 selectors)
2. testid variations  
3. role+text matching
4. tag+text fuzzy matching
5. xpath fallback
6. parentChain context
7. title-hint extraction
       ↓
Found? → ElementWatcher emits 'found'
       ↓
GuideRunner receives event → 
- Renders light overlay
- Sets up click advance 
- Starts position tracking
- Validates action completion
       ↓
URL changes? → URLMonitor emits 'url_changed' →
GuideRunner checks if expected for current/future step
       ↓
Action completed? → Advance to next step
Clean up all handlers → Create new ElementWatcher
```

### State Machine Definition

```typescript
type GuideState = 
  | { type: 'idle' }
  | { type: 'searching'; step: GuideStep; retryCount: number }
  | { type: 'active'; step: GuideStep; element: Element }
  | { type: 'intermediate'; step: GuideStep; blocker: Element } 
  | { type: 'notfound'; step: GuideStep; timeoutReached: boolean }
  | { type: 'llm_recovery'; step: GuideStep; context: DOMState }
  | { type: 'completed' }

type GuideEvent =
  | { type: 'START'; guide: Guide; startIndex?: number }
  | { type: 'ELEMENT_FOUND'; element: Element; confidence: number }
  | { type: 'ELEMENT_CHANGED'; element: Element }  
  | { type: 'ELEMENT_TIMEOUT' }
  | { type: 'ACTION_COMPLETED' }
  | { type: 'URL_CHANGED'; oldUrl: string; newUrl: string }
  | { type: 'USER_SKIP' }
  | { type: 'STOP' }
```

### Technical Implementation Strategy

#### 1. ElementWatcher (Event-Driven Core)
```typescript
class ElementWatcher extends EventEmitter {
  private timeoutHandle: number | null = null;
  private retryCount = 0;
  private readonly RETRY_DELAY = 200; // 200ms between attempts
  
  start(step: GuideStep) {
    this.findElement();
  }
  
  private findElement() {
    clearTimeout(this.timeoutHandle);
    
    if (this.retryCount * this.RETRY_DELAY > this.timeoutMs) {
      this.emit('timeout'); 
      return;
    }
    
    const result = ElementFinder.findInCascade(this.step);
    if (result) {
      this.emit('found', result.element, result.confidence);
      this.startValidationLoop(result.element);
    } else {
      this.timeoutHandle = setTimeout(() => 
        this.findElement(this.retryCount + 1), this.RETRY_DELAY);
    }
  }
  
  private startValidationLoop(element: Element) {
    // Periodic validation that element is still valid
    const validate = () => {
      if (!element.isConnected || !this.elementMatchesSelector(element)) {
        this.findElement(); // Re-search
      } else {
        setTimeout(validate, 1000); // Re-check every second
      }
    };
    setTimeout(validate, 1000);
  }
}
```

#### 2. Progressive Element Search Timing  
```typescript
// Instead of waiting 2 seconds then showing "not found"
// Show search progress with different strategies at different intervals:

// 0-200ms: Try selectorSet (instant for most cases)
// 200-500ms: Try fallback levels (testid, role, text)  
// 500-1000ms: Try fuzzy matching + title hints
// 1000-2000ms: Show "searching..." indicator
// 2000ms+: Show screenshot fallback, suggest LLM recovery
```

#### 3. Confidence-Based Behavior
```typescript
interface FindResult {
  element: Element;
  confidence: number; // 0.0 to 1.0
  method: string;
}

// High confidence (>0.85): instantly show highlight, no delay
// Medium confidence (0.5-0.85): show highlight but with a "?" indicator  
// Low/no confidence: show screenshot fallback in sidepanel
```

#### 4. Action-Aware Step Detection
```typescript
function validateElementForAction(element: Element, actionType: string): boolean {
  switch (actionType) {
    case 'click':
      return element.matches('button, a, [onclick], [role="button"]') || 
             isClickable(element);
    case 'type':
      return element.matches('input, textarea, [contenteditable]');
    case 'select':
      return element.matches('select, [role="combobox"]');
    default:
      return true;
  }
}
```

#### 5. LLM Self-Healing Fallback
```typescript
async function attemptLLMRecovery(step: GuideStep, pageState: DOMState): Promise<FindResult | null> {
  const response = await fetch('/api/element-recovery', {
    method: 'POST',
    body: JSON.stringify({
      stepTitle: step.title,
      stepDescription: step.description,
      actionType: step.action_type,
      expectedElementText: step.element_text,
      domSnapshot: pageState.serializedDOM.slice(0, 50000), // Truncate for API
      currentSelectors: step.selectorSet,
    })
  });
  
  const result = await response.json();
  if (result.foundElement) {
    // Update the recording with better selectors for future use
    await updateStepSelectors(step.id, result.updatedSelectors);
    return { element: result.element, confidence: 0.7, method: 'llm-recovery' };
  }
  return null;
}
```

#### 6. Navigation-Aware Step Handling
```typescript
class URLMonitor extends EventEmitter {
  private lastUrl: string = '';
  
  private checkURL() {
    const currentUrl = window.location.href;
    if (currentUrl !== this.lastUrl) {
      this.emit('url_changed', this.lastUrl, currentUrl);
      this.lastUrl = currentUrl; 
    }
  }
  
  start() {
    window.addEventListener('popstate', () => this.checkURL());
    window.addEventListener('hashchange', () => this.checkURL());
    setInterval(() => this.checkURL(), 500); // SPA detection
  }
}

// In GuideRunner:
onURLChanged(oldUrl: string, newUrl: string) {
  const currentStep = this.steps[this.currentIndex];
  
  // Is new URL expected by current step?
  if (this.urlMatches(newUrl, currentStep.expected_url)) {
    return; // Stay on current step
  }
  
  // Is new URL expected by a LATER step?
  for (let i = this.currentIndex + 1; i < this.steps.length; i++) {
    if (this.urlMatches(newUrl, this.steps[i].expected_url)) {
      this.skipToStep(i); // Jump ahead
      return;
    }
  }
  
  // Unexpected URL - pause and ask user
  this.pauseForUnexpectedNavigation(oldUrl, newUrl);
}
```

## Implementation Plan

### Phase 1: Core Event-Driven Architecture (Week 1-2)
1. Implement ElementWatcher with event emitters
2. Implement URLMonitor for SPA detection  
3. Replace polling with event-driven GuideRunner state machine
4. Maintain existing UI but fix race conditions

### Phase 2: Enhanced Element Finding (Week 3)  
1. Port sophisticated occlusion detection from browser-use
2. Add element validation after SPA re-renders
3. Implement progressive search timing
4. Add confidence-based behavior

### Phase 3: Self-Healing & Recovery (Week 4)
1. Implement LLM-assisted element recovery API
2. Add automatic selector updating for recordings
3. Implement action-aware step detection validation
4. Add comprehensive error recovery strategies

### Phase 4: UI Polish & Testing (Week 5-6)
1. Implement Tango-style light overlay + rich sidebar
2. Add screenshot fallback when elements not found
3. Comprehensive testing across different site types  
4. Performance optimization and monitoring

## Success Metrics

### Reliability Targets
- **Element Detection**: >95% success rate (up from ~80% current)
- **Step Accuracy**: >98% correct step progression (up from ~70% current)  
- **Race Conditions**: 0 false advances or random guide closures
- **Performance**: <10ms element finding for high-confidence matches

### User Experience Targets  
- **Perceived Speed**: Steps advance instantly for >90% of cases
- **Error Recovery**: Clear guidance provided when automatic detection fails
- **Multi-page**: Seamless workflow tracking across 10+ page transitions
- **Self-Healing**: Broken guides automatically repair themselves >70% of time

## Risk Mitigation

### Development Risks
- **Complexity**: Implement in phases, maintain backward compatibility
- **Browser Compatibility**: Extensive testing across Chrome versions
- **Performance**: Continuous profiling and optimization

### Deployment Risks  
- **Regression**: A/B test new implementation against current version
- **User Adoption**: Gradual rollout with feature flags
- **Monitoring**: Comprehensive error tracking and performance metrics

## Conclusion

The hybrid architecture combines the best aspects of all four systems:

- **Usertour's** clean event-driven architecture and reliable state management
- **Browser-use's** sophisticated element validation and CDP integration
- **Tango's** excellent multi-page workflow handling and light UI approach  
- **Stept's** superior element finding cascade and polished user interface

The result will be a guide runtime that is both more reliable and more performant than any individual system, with innovative features like LLM self-healing that push beyond what any existing solution provides.

This foundation will enable stept to become the most reliable and user-friendly guided experience platform in the market.