import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import React, { useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { ChevronDown, ChevronRight, Mouse, Keyboard, ScreenShare, LayoutList, Presentation, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import {  getWorkflowImage } from '@/api/workflows';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {useWorkflow } from '@/hooks/api/workflows';

interface ProcessStep {
  step_number: number;
  timestamp: string;
  action_type: string;
  window_title: string;
  description: string;
  global_position?: { x: number; y: number } | [number, number];
  relative_position?: { x: number; y: number } | [number, number];
  window_size?: { width: number; height: number } | [number, number];
  screenshot_relative_position?: { x: number; y: number };
  screenshot_size?: { width: number; height: number };
  key_pressed?: string;
  text_typed?: string;
  scroll_delta?: [number, number];
  generated_title?: string;
  generated_description?: string;
}

interface ProcessRecordingData {
  session_id: string;
  status: string;
  created_at: string;
  total_steps: number;
  metadata: ProcessStep[];
  storage_type: string;
  storage_path: string;
}

type ViewMode = 'slide' | 'expanded';

const ProcessRecordingComponent = ({ node }: { node: any }) => {
  const { sessionId } = node.attrs;
  const { data: recording, isLoading: loading, error: queryError } = useWorkflow(sessionId);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('slide');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [imageLoadErrors, setImageLoadErrors] = useState<Set<number>>(new Set());

  const error = queryError ? 'Failed to load recording' : null;

  const toggleStep = (stepNumber: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepNumber)) {
      newExpanded.delete(stepNumber);
    } else {
      newExpanded.add(stepNumber);
    }
    setExpandedSteps(newExpanded);
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'click':
      case 'double_click':
      case 'right_click':
        return <Mouse className="w-4 h-4" />;
      case 'key_press':
      case 'type':
        return <Keyboard className="w-4 h-4" />;
      default:
        return <ScreenShare className="w-4 h-4" />;
    }
  };

  const goToNextSlide = () => {
    if (recording && currentSlideIndex < recording.metadata.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
  };

  const goToPreviousSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const handleImageError = (stepNumber: number) => {
    setImageLoadErrors(prev => new Set(prev).add(stepNumber));
  };

  const renderStepImage = (stepNumber: number, step?: ProcessStep) => {
    const hasError = imageLoadErrors.has(stepNumber);
    
    if (hasError) {
      return (
        <div className="w-full h-64 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <ScreenShare className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Image unavailable</p>
          </div>
        </div>
      );
    }

    // Use the URL directly - no need to fetch via apiClient
    const imageUrl = getWorkflowImage(sessionId, stepNumber);

    // Calculate click indicator position
    // Prefer screenshot_relative_position + screenshot_size (cropped screenshot coords),
    // fall back to relative_position + window_size (full window coords)
    let circlePos: { x: number; y: number } | null = null;
    if (step) {
      const pos = step.screenshot_relative_position ?? step.relative_position;
      const size = step.screenshot_size ?? step.window_size;
      if (pos && size) {
        const px = typeof pos === 'object' && 'x' in pos ? pos.x : Array.isArray(pos) ? pos[0] : null;
        const py = typeof pos === 'object' && 'y' in pos ? pos.y : Array.isArray(pos) ? pos[1] : null;
        const sw = typeof size === 'object' && 'width' in size ? size.width : Array.isArray(size) ? size[0] : null;
        const sh = typeof size === 'object' && 'height' in size ? size.height : Array.isArray(size) ? size[1] : null;
        if (px != null && py != null && sw && sh) {
          circlePos = { x: (px / sw) * 100, y: (py / sh) * 100 };
        }
      }
    }

    return (
      <div className="relative">
        <img
          src={imageUrl}
          alt={`Step ${stepNumber}`}
          className="w-full rounded-lg border border-gray-200 shadow-sm"
          loading="lazy"
          onError={() => handleImageError(stepNumber)}
        />
        {circlePos && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${circlePos.x}%`,
              top: `${circlePos.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="absolute -inset-4 rounded-full bg-blue-500/20 animate-pulse" />
            <div className="relative h-8 w-8 rounded-full border-2 border-blue-600 bg-blue-500/30">
              <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600" />
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <NodeViewWrapper className="process-recording-node">
        <div className="p-4 border rounded-lg bg-gray-50">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  if (error || !recording) {
    return (
      <NodeViewWrapper className="process-recording-node">
        <div className="p-4 border border-red-200 rounded-lg bg-red-50">
          <p className="text-red-600">{error || 'Recording not found'}</p>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="process-recording-node">
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold text-lg text-gray-900">Process Recording</h3>
              <p className="text-sm text-gray-600 mt-1">
                {recording.total_steps} steps • {format(new Date(recording.created_at), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* replaced status pill with shadcn Badge */}
              <Badge variant="secondary">{recording.status}</Badge>
              {/* replaced raw button with shadcn Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setViewMode(viewMode === 'slide' ? 'expanded' : 'slide');
                  setCurrentSlideIndex(0);
                }}
                className="gap-1"
              >
                {viewMode === 'slide' ? (
                  <>
                    <LayoutList className="w-4 h-4" />
                    Expand All
                  </>
                ) : (
                  <>
                    <Presentation className="w-4 h-4" />
                    Slide View
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Slide Mode */}
        {viewMode === 'slide' && recording.metadata && recording.metadata.length > 0 && (
          <div className="p-6">
            {(() => {
              const step = recording.metadata[currentSlideIndex];
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                      {step.step_number}
                    </span>
                    {getActionIcon(step.action_type)}
                    <div className="flex-1">
                      <p className="text-base font-semibold text-gray-900">
                        {step.generated_title || step.description || `${step.action_type} action`}
                      </p>
                      <p className="text-sm text-gray-500">{step.window_title}</p>
                    </div>
                  </div>

                  {renderStepImage(step.step_number, step)}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {step.global_position && Array.isArray(step.global_position) && (
                      <div className="p-2 bg-gray-50 rounded">
                        <span className="text-gray-500">Position:</span>{' '}
                        <span className="font-mono">{step.global_position.join(', ')}</span>
                      </div>
                    )}
                    {step.key_pressed && (
                      <div className="p-2 bg-gray-50 rounded">
                        <span className="text-gray-500">Key:</span>{' '}
                        <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs ml-1">
                          {step.key_pressed}
                        </kbd>
                      </div>
                    )}
                    {step.text_typed && (
                      <div className="col-span-2 p-2 bg-gray-50 rounded">
                        <span className="text-gray-500">Typed:</span>{' '}
                        <span className="font-mono bg-yellow-50 px-2 py-1 rounded ml-1">{step.text_typed}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    {/* replaced raw button with shadcn Button */}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={goToPreviousSlide}
                      disabled={currentSlideIndex === 0}
                      className="gap-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>

                    <span className="text-sm text-gray-600">
                      {currentSlideIndex + 1} / {recording.metadata.length}
                    </span>

                    {/* replaced raw button with shadcn Button */}
                    <Button
                      size="sm"
                      onClick={goToNextSlide}
                      disabled={currentSlideIndex === recording.metadata.length - 1}
                      className="gap-2"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Expanded Mode */}
        {viewMode === 'expanded' && (
          // removed fixed max height and scroll to let it expand naturally
          <div className="divide-y divide-gray-100">
            {recording.metadata?.map((step) => (
              <div key={step.step_number} className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                    {step.step_number}
                  </span>
                  {getActionIcon(step.action_type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {step.generated_title || step.description || `${step.action_type} action`}
                    </p>
                    <p className="text-xs text-gray-500">{step.window_title}</p>
                  </div>
                </div>

                {renderStepImage(step.step_number, step)}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {step.global_position && Array.isArray(step.global_position) && (
                    <div>
                      <span className="text-gray-500">Position:</span>{' '}
                      <span className="font-mono">{step.global_position.join(', ')}</span>
                    </div>
                  )}
                  {step.key_pressed && (
                    <div>
                      <span className="text-gray-500">Key:</span>{' '}
                      <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs">
                        {step.key_pressed}
                      </kbd>
                    </div>
                  )}
                  {step.text_typed && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Typed:</span>{' '}
                      <span className="font-mono bg-yellow-50 px-1 rounded">{step.text_typed}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

const ProcessRecordingNode = Node.create({
  name: 'process-recording-node',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      sessionId: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-process-recording]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-process-recording': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProcessRecordingComponent);
  },
});

export default ProcessRecordingNode;
