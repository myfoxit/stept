import * as React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkflow } from '@/hooks/api/workflows';
import { getWorkflowImage } from '@/api/workflows';
import { useZoomPan } from '@/hooks/use-zoom-pan';
import { WorkflowBanner } from '@/components/workflow/workflow-banner';
import { WorkflowHeader } from '@/components/workflow/workflow-header';
import { WorkflowStep } from '@/components/workflow/workflow-step';
import { InsertStepMenu } from '@/components/workflow/insert-step-menu';
import {
  HeaderStep,
  TipStep,
  AlertStep,
  EmptyImageStep
} from '@/components/workflow/step-variants';
import { ImageUploadModal } from '@/components/workflow/image-upload-modal';
import { ShareExportModal } from '@/components/workflow/share-export-modal';
import { GuidePanel } from '@/components/workflow/guide-panel';
import { SmartStepOverlay } from '@/components/workflow/smart-step-card';
import { formatDuration } from '@/utils/workflow';
import {
  createStep,
  updateStep,
  deleteStep,
  uploadStepImage
} from '@/api/workflows';
import {
  processRecording,
  getAISummary,
  type ProcessingStatus,
  type AISummary,
  type StepAnnotation,
} from '@/api/processing';
import type { WorkflowStep as WorkflowStepType, Workflow } from '@/types/workflow';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateWorkflow } from '@/hooks/api/workflows';
import { SiteHeader } from '@/components/site-header';
import { useChat } from '@/components/Chat/ChatContext';
import { useProject } from '@/providers/project-provider';
import { ContextLinkPanel } from '@/components/ContextLinks/ContextLinkPanel';
import { CommentButton } from '@/components/Comments/CommentButton';
import { CommentPanel } from '@/components/Comments/CommentPanel';
import { useAuth } from '@/providers/auth-provider';

export function WorkflowView() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: workflow, isLoading } = useWorkflow(workflowId || '');
  const { setContext } = useChat();
  const { selectedProjectId } = useProject();
  const { user } = useAuth();

  // Comments state
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [commentCount, setCommentCount] = React.useState(0);
  
  // NEW: Derive edit mode from URL
  const isEditMode = location.pathname.endsWith('/edit');

  // Set chat context when viewing a workflow
  React.useEffect(() => {
    if (workflowId) {
      setContext({ recording_id: workflowId, project_id: selectedProjectId || undefined });
    }
    return () => setContext(null);
  }, [workflowId, setContext, selectedProjectId]);
  
  const [uploadModalState, setUploadModalState] = React.useState<{
    open: boolean;
    stepNumber?: number;
    insertIndex?: number;
    isReplacement?: boolean; // NEW: track replacement mode
  }>({ open: false });
  const qc = useQueryClient();
  const updateWorkflowMutation = useUpdateWorkflow(); // NEW

  // NEW: local icon override to reflect changes immediately
  const [iconOverride, setIconOverride] = React.useState<{
    type: 'tabler' | 'favicon';
    value: string;
    color?: string;
  } | null>(null);

  // NEW: Reset icon override when workflowId changes
  React.useEffect(() => {
    setIconOverride(null);
  }, [workflowId]);

  const {
    zoomStates,
    imageRefs,
    zoomLevels,
    handleZoomIn,
    handleZoomOut,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
  } = useZoomPan();

  const typedWorkflow = workflow as Workflow | undefined;

  // NEW: initialize iconOverride from workflow when it changes (if backend provides fields)
  React.useEffect(() => {
    if (!typedWorkflow) return;
    const t = (typedWorkflow as any).icon_type as 'tabler' | 'favicon' | undefined;
    const v = (typedWorkflow as any).icon_value as string | undefined;
    const c = (typedWorkflow as any).icon_color as string | undefined;
    if (t && v) {
      setIconOverride({ type: t, value: v, color: c });
    }
  }, [typedWorkflow]);

  const steps = React.useMemo(
    () =>
      ((typedWorkflow?.metadata ?? []) as WorkflowStepType[]).sort(
        (a, b) => (a.step_number ?? 0) - (b.step_number ?? 0),
      ),
    [typedWorkflow],
  );

  // NEW: compute visible (image-only) step count
  const visibleStepCount = React.useMemo(
    () =>
      steps.filter(s =>
        s.step_type === 'screenshot' ||
        s.step_type === 'capture' ||
        s.step_type === 'gif' ||
        s.step_type === 'video'
      ).length,
    [steps]
  );

  // Replace old stepCount usage with visibleStepCount
  const stepCount =
    typedWorkflow?.total_steps ??
    visibleStepCount ??
    0;

  const durationSeconds = typedWorkflow?.duration_seconds;
  const durationLabel = formatDuration(durationSeconds);

  const refreshWorkflow = React.useCallback(() => {
    if (workflowId) {
      qc.invalidateQueries({ queryKey: ['workflow', workflowId] });
    }
  }, [qc, workflowId]);

  // NEW: Handle edit mode toggle via URL navigation - moved before conditional returns
  const handleToggleEdit = React.useCallback(() => {
    if (!workflowId) return;
    
    if (isEditMode) {
      // Exit edit mode - remove /edit from URL
      navigate(`/workflow/${workflowId}`, { replace: true });
    } else {
      // Enter edit mode - add /edit to URL
      navigate(`/workflow/${workflowId}/edit`, { replace: true });
    }
  }, [isEditMode, workflowId, navigate]);

  // Map UI selection to backend step_type + default content
  const mapType = (uiType: string): { step_type: string; description: string; content?: string } => {
    if (uiType === 'step' || uiType === 'capture') {
      return { step_type: 'screenshot', description: `Step ${indexForMapping + 1}` };
    }
    if (uiType === 'gif') {
      return { step_type: 'gif', description: 'GIF' };
    }
    if (uiType === 'tip') {
      return { step_type: 'tip', description: 'Tip', content: 'Enter your tip here...' };
    }
    if (uiType === 'alert') {
      return { step_type: 'alert', description: 'Alert', content: 'Enter alert message here...' };
    }
    if (uiType === 'header') {
      return { step_type: 'header', description: 'Header', content: 'Header Title' };
    }
    return { step_type: 'text', description: 'Text Step' };
  };

  // NEW: internal variable for mapType (closure needs index)
  let indexForMapping = 0;

  const handleInsertStep = async (index: number, type: string) => {
    if (!workflowId) return;
    indexForMapping = index;
    try {
      const mapped = mapType(type);
      await createStep(workflowId, index + 1, {
        step_type: mapped.step_type as any,
        description: mapped.description,
        content: mapped.content,
      });
      // Open upload modal only for image-like steps
      if (mapped.step_type === 'screenshot' || mapped.step_type === 'gif') {
        setUploadModalState({ open: true, stepNumber: index + 1, insertIndex: index, isReplacement: false }); // NEW
      }
      refreshWorkflow();
    } catch (error) {
      console.error('Failed to insert step:', error);
    }
  };

  const handleDeleteStep = async (stepNumber: number) => {
    if (!workflowId) return;

    if (!confirm('Are you sure you want to delete this step?')) return;

    try {
      await deleteStep(workflowId, stepNumber);
      refreshWorkflow();
    } catch (error) {
      console.error('Failed to delete step:', error);
    }
  };

  const handleUpdateStep = async (
    stepNumber: number,
    content: string,
    description?: string
  ) => {
    if (!workflowId) return;

    try {
      await updateStep(workflowId, stepNumber, { content, description });
      refreshWorkflow();
    } catch (error) {
      console.error('Failed to update step:', error);
    }
  };

  // NEW: Handle icon update via hook (invalidates folderTree so sidebar updates)
  const handleUpdateIcon = async (type: 'tabler' | 'favicon', value: string, color?: string) => {
    if (!workflowId) return;
    try {
      setIconOverride({ type, value, color }); // optimistic UI
      await updateWorkflowMutation.mutateAsync({
        workflowId,
        icon_type: type,
        icon_value: value,
        icon_color: color,
      });
      refreshWorkflow();
    } catch (error) {
      console.error('Failed to update icon:', error);
      refreshWorkflow();
    }
  };

  // NEW: Handle title update via hook (invalidates folderTree so sidebar updates)
  const handleUpdateTitle = async (newTitle: string) => {
    if (!workflowId) return;
    try {
      await updateWorkflowMutation.mutateAsync({
        workflowId,
        name: newTitle,
      });
      refreshWorkflow();
    } catch (error) {
      console.error('Failed to rename workflow:', error);
      refreshWorkflow();
    }
  };

  const handleUploadImage = async (file: File, replace?: boolean) => {
    if (!workflowId || !uploadModalState.stepNumber) return;
    try {
      const doReplace = replace ?? uploadModalState.isReplacement ?? false; // NEW
      await uploadStepImage(workflowId, uploadModalState.stepNumber, file, doReplace); // NEW: pass replace
      setUploadModalState({ open: false }); // Close modal immediately after successful upload
      refreshWorkflow();
    } catch (e) {
      console.error('Failed to upload image', e);
      alert('Failed to upload image. Please try again.');
    }
  };

  const handleReplaceImage = (stepNumber: number) => {
    setUploadModalState({ open: true, stepNumber, isReplacement: true }); // NEW
  };

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const [shareModalOpen, setShareModalOpen] = React.useState(false);

  // AI state
  const [guideOpen, setGuideOpen] = React.useState(false);

  const isProcessed = typedWorkflow ? Boolean((typedWorkflow as any).is_processed) : false;

  const handleGenerateGuide = React.useCallback(() => {
    setGuideOpen(true);
  }, []);

  const handleAnnotationUpdate = React.useCallback(() => {
    refreshWorkflow();
  }, [refreshWorkflow]);

  // Add missing handler functions
  const handleDuplicateStep = async (stepNumber: number) => {
    console.log('Duplicate step:', stepNumber);
    // TODO: Implement step duplication
  };

  const handleCopyLinkToStep = (stepNumber: number) => {
    const url = `${window.location.origin}/workflow/${workflowId}#step-${stepNumber}`;
    navigator.clipboard.writeText(url);
    console.log('Link copied to clipboard');
  };

  const handleUpdateGuideLink = (stepNumber: number) => {
    console.log('Update guide link for step:', stepNumber);
    // TODO: Implement guide link update
  };

  const handleDownloadImage = async (stepNumber: number, full: boolean) => {
    const imageUrl = getWorkflowImage(workflowId!, stepNumber);
    const link = document.createElement('a');
    // NOTE: keep backend stepNumber in filename (can be changed to visible number if desired)
    link.href = imageUrl;
    link.download = `step-${stepNumber}${full ? '-full' : ''}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <div>
        <SiteHeader name="Workflow" />
        <div className="min-h-screen bg-white">
          <div className="border-b bg-orange-50/50">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 text-sm">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
          </div>

          <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
            <div className="flex items-start gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-7 w-72" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>

            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!typedWorkflow || !workflowId) {
    return (
      <div>
        <SiteHeader name="Workflow" />
        <div className="container mx-auto max-w-7xl p-6 rounded-full">
          <div className="py-12 text-center">
            <h2 className="mb-2 text-2xl font-semibold">Workflow not found</h2>
            <p className="mb-4 text-muted-foreground">
              The workflow you&apos;re looking for doesn&apos;t exist or has been
              deleted.
            </p>
            <Button onClick={() => navigate(-1)} variant="outline">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleZoomToClick = (stepNumber: number, step: WorkflowStepType) => {
    const screenshotRel = step.screenshot_relative_position;
    const size = step.screenshot_size ?? step.window_size;
    const container = imageRefs.current[stepNumber];

    if (screenshotRel && size && container) {
      const rect = container.getBoundingClientRect();
      const clickX = (screenshotRel.x / size.width) * rect.width;
      const clickY = (screenshotRel.y / size.height) * rect.height;
      handleZoomIn(stepNumber, { x: clickX, y: clickY });
    } else {
      handleZoomIn(stepNumber);
    }
  };

  const renderStep = (step: WorkflowStepType, index: number) => {
    const backendStepNumber = step.step_number ?? index + 1;

    // NEW: compute a visible step index that skips non-image variants
    const visibleIndex = steps
      .slice(0, index + 1)
      .filter(s =>
        s.step_type === 'screenshot' ||
        s.step_type === 'capture' ||
        s.step_type === 'gif' ||
        s.step_type === 'video'
      ).length;

    const isImageLike =
      step.step_type === 'screenshot' ||
      step.step_type === 'capture' ||
      step.step_type === 'gif' ||
      step.step_type === 'video';

    const imageUrl = getWorkflowImage(workflowId!, backendStepNumber);

    // HEADER / TIP / ALERT do not show numbers anymore
    if (step.step_type === 'header') {
      return (
        <HeaderStep
          key={backendStepNumber}
          // stepNumber intentionally omitted from UI
          stepNumber={0}
          content={step.content}
          description={step.description}
          isEditMode={isEditMode}
          onUpdate={(content, desc) => handleUpdateStep(backendStepNumber, content, desc)}
          onDelete={() => handleDeleteStep(backendStepNumber)}
          onDuplicate={() => handleDuplicateStep(backendStepNumber)}
          onCopyLink={() => handleCopyLinkToStep(backendStepNumber)}
          onReplaceImage={() => handleReplaceImage(backendStepNumber)}
          onDownloadImage={(full) => handleDownloadImage(backendStepNumber, full)}
        />
      );
    }

    if (step.step_type === 'tip') {
      return (
        <TipStep
          key={backendStepNumber}
          stepNumber={0}
          content={step.content}
          description={step.description}
          isEditMode={isEditMode}
          onUpdate={(content, desc) => handleUpdateStep(backendStepNumber, content, desc)}
          onDelete={() => handleDeleteStep(backendStepNumber)}
          onDuplicate={() => handleDuplicateStep(backendStepNumber)}
          onCopyLink={() => handleCopyLinkToStep(backendStepNumber)}
          onReplaceImage={() => handleReplaceImage(backendStepNumber)}
          onDownloadImage={(full) => handleDownloadImage(backendStepNumber, full)}
        />
      );
    }

    if (step.step_type === 'alert') {
      return (
        <AlertStep
          key={backendStepNumber}
          stepNumber={0}
          content={step.content}
          description={step.description}
          isEditMode={isEditMode}
          onUpdate={(content, desc) => handleUpdateStep(backendStepNumber, content, desc)}
          onDelete={() => handleDeleteStep(backendStepNumber)}
          onDuplicate={() => handleDuplicateStep(backendStepNumber)}
          onCopyLink={() => handleCopyLinkToStep(backendStepNumber)}
          onReplaceImage={() => handleReplaceImage(backendStepNumber)}
          onDownloadImage={(full) => handleDownloadImage(backendStepNumber, full)}
        />
      );
    }

    // Check if this is an empty image step (no file uploaded yet)
    const hasImage = step.has_image || step.file_uploaded;
    if (isImageLike && !hasImage) {
      return (
        <EmptyImageStep
          key={backendStepNumber}
          // NEW: pass visible index here; UI will show no number, but you have it if needed
          stepNumber={visibleIndex}
          description={step.description}
          isEditMode={isEditMode}
          onUploadImage={() => setUploadModalState({ open: true, stepNumber: backendStepNumber, isReplacement: false })}
          onUpdate={(content, desc) => handleUpdateStep(backendStepNumber, content, desc)}
          onDelete={() => handleDeleteStep(backendStepNumber)}
          onDuplicate={() => handleDuplicateStep(backendStepNumber)}
          onCopyLink={() => handleCopyLinkToStep(backendStepNumber)}
          onReplaceImage={() => handleReplaceImage(backendStepNumber)}
          onDownloadImage={(full) => handleDownloadImage(backendStepNumber, full)}
        />
      );
    }

    // Default: render as regular workflow step with image
    const zoomState = zoomStates[backendStepNumber] || {
      stepNumber: backendStepNumber,
      zoomLevel: 0,
      translateX: 0,
      translateY: 0,
    };

    return (
      <div key={backendStepNumber}>
        <WorkflowStep
          key={backendStepNumber}
          step={step}
          // NEW: backendStepNumber is still used for API, visibleIndex for display
          stepNumber={backendStepNumber}
          visibleIndex={visibleIndex}
          imageUrl={imageUrl}
          isEditMode={isEditMode}
          zoomState={zoomState}
          zoomLevels={zoomLevels}
          onZoomIn={() => handleZoomToClick(backendStepNumber, step)}
          onZoomOut={() => handleZoomOut(backendStepNumber)}
          onPanStart={e => {
            if (e.type === 'touchstart') (e as any).preventDefault(); // NEW
            handlePanStart(e, backendStepNumber);
          }}
          onPanMove={e => {
            if (e.type === 'touchmove') (e as any).preventDefault(); // NEW
            handlePanMove(e);
          }}
          onPanEnd={() => handlePanEnd()}
          onDelete={() => handleDeleteStep(backendStepNumber)}
          onDuplicate={() => handleDuplicateStep(backendStepNumber)}
          onCopyLink={() => handleCopyLinkToStep(backendStepNumber)}
          onUpdateGuideLink={() => handleUpdateGuideLink(backendStepNumber)}
          onReplaceImage={() => handleReplaceImage(backendStepNumber)}
          onDownloadImage={full => handleDownloadImage(backendStepNumber, full)}
          imageRef={el => { imageRefs.current[backendStepNumber] = el; }}
          onUpdateTitle={(newTitle) => handleUpdateStep(backendStepNumber, step.content || '', newTitle)}
        />
        <SmartStepOverlay
          stepId={step.id}
          generatedTitle={(step as any).generated_title}
          generatedDescription={(step as any).generated_description}
          uiElement={(step as any).ui_element}
          stepCategory={(step as any).step_category}
          isAnnotated={(step as any).is_annotated}
          isEditMode={isEditMode}
          onAnnotationUpdate={handleAnnotationUpdate}
        />
      </div>
    );
  };

  return (
    <div>
      <SiteHeader name={typedWorkflow.name || 'Workflow'} />
      
      <div className="min-h-screen bg-white rounded-2xl">
        <WorkflowBanner
          isEditMode={isEditMode}
          onToggleEdit={handleToggleEdit}
          onShare={handleShare}
        />

        <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <WorkflowHeader
            workflow={typedWorkflow}
            stepCount={stepCount}
            durationLabel={durationLabel}
            isEditMode={isEditMode}
            onUpdateIcon={handleUpdateIcon}  // NEW: Pass the handler
            // NEW: pass icon override to header
            iconOverride={iconOverride || undefined}
            // NEW: allow editing title from header
            onUpdateTitle={handleUpdateTitle}
          />
            </div>
            {selectedProjectId && workflowId && (
              <CommentButton count={commentCount} onClick={() => setCommentsOpen(true)} />
            )}
          </div>

          {selectedProjectId && workflowId && (
            <ContextLinkPanel projectId={selectedProjectId} resourceType="workflow" resourceId={workflowId} />
          )}

          {isEditMode ? (
            <InsertStepMenu index={0} onInsert={handleInsertStep} stepNumber={1} />
          ) : (
            <div className="border-t border-slate-200" />
          )}

          <section className="space-y-6">
            {steps && steps.length > 0 ? (
              <>
                {steps.map((step, index) => (
                  <React.Fragment key={step.step_number ?? index + 1}>
                    {renderStep(step, index)}

                    {isEditMode && index < steps.length - 1 && (
                      <InsertStepMenu
                        index={index + 1}
                        onInsert={handleInsertStep}
                        stepNumber={index + 2}
                      />
                    )}
                  </React.Fragment>
                ))}
              </>
            ) : (
              <Card className="flex flex-col items-center justify-center gap-3 rounded-2xl border-dashed bg-white/60 py-12 text-center text-sm text-muted-foreground">
                <p>No steps have been recorded for this workflow yet.</p>
                {isEditMode && (
                  <Button size="sm" variant="outline">
                    <IconPlus className="mr-1 h-3 w-3" />
                    Add your first step
                  </Button>
                )}
              </Card>
            )}
          </section>
        </div>

        <ImageUploadModal
          open={uploadModalState.open}
          onClose={() => setUploadModalState({ open: false })}
          onUpload={handleUploadImage}
          stepNumber={uploadModalState.stepNumber || 1}
          isReplacement={uploadModalState.isReplacement ?? false}
        />
        
        <ShareExportModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          workflowId={workflowId}
          workflowName={typedWorkflow.name || 'Workflow'}
          isPrivate={(typedWorkflow as any)?.is_private}
        />

        <GuidePanel
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          recordingId={workflowId!}
          existingGuide={(typedWorkflow as any)?.guide_markdown}
        />

        {selectedProjectId && workflowId && user && (
          <CommentPanel
            open={commentsOpen}
            onOpenChange={setCommentsOpen}
            projectId={selectedProjectId}
            resourceType="workflow"
            resourceId={workflowId}
            currentUserId={user.id}
            onCountChange={setCommentCount}
          />
        )}
      </div>
    </div>
  );
}
