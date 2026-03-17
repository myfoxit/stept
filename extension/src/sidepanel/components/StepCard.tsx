import React, { useRef, useCallback } from 'react';
import type { Step } from '../App';

interface StepCardProps {
  step: Step;
  stepIndex: number;
  isNew: boolean;
  onDelete: (stepNumber: number) => void;
  onDescriptionChange: (stepIndex: number, newDesc: string) => void;
  onDrop: (fromIndex: number, toIndex: number) => void;
  onScreenshotClick: (src: string, alt: string) => void;
}

export default function StepCard({
  step,
  stepIndex,
  isNew,
  onDelete,
  onDescriptionChange,
  onDrop,
  onScreenshotClick,
}: StepCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);

  const handleDescClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const el = descRef.current;
      if (el) {
        el.contentEditable = 'true';
        el.focus();
        el.classList.add('editing');
      }
    },
    [],
  );

  const handleDescBlur = useCallback(() => {
    const el = descRef.current;
    if (!el) return;
    el.contentEditable = 'false';
    el.classList.remove('editing');
    const newDesc = (el.textContent || '').trim();
    if (newDesc && newDesc !== (step.description || step.actionType)) {
      onDescriptionChange(stepIndex, newDesc);
    }
  }, [step.description, step.actionType, stepIndex, onDescriptionChange]);

  const handleDescKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        descRef.current?.blur();
      }
      if (e.key === 'Escape') {
        const el = descRef.current;
        if (el) el.textContent = step.description || step.actionType;
        el?.blur();
      }
    },
    [step.description, step.actionType],
  );

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      cardRef.current?.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', stepIndex.toString());
    },
    [stepIndex],
  );

  const handleDragEnd = useCallback(() => {
    cardRef.current?.classList.remove('dragging');
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    cardRef.current?.classList.add('drag-over');
  }, []);

  const handleDragLeave = useCallback(() => {
    cardRef.current?.classList.remove('drag-over');
  }, []);

  const handleDropEvent = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      cardRef.current?.classList.remove('drag-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      onDrop(fromIndex, stepIndex);
    },
    [stepIndex, onDrop],
  );

  const hasClickMarker =
    step.screenshotRelativeMousePosition && step.screenshotSize;
  const clickMarkerStyle = hasClickMarker
    ? {
        left: `${(step.screenshotRelativeMousePosition!.x / step.screenshotSize!.width) * 100}%`,
        top: `${(step.screenshotRelativeMousePosition!.y / step.screenshotSize!.height) * 100}%`,
      }
    : undefined;

  return (
    <div
      ref={cardRef}
      className={`step-card${isNew ? ' new' : ''}`}
      data-step-number={step.stepNumber}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropEvent}
    >
      <div className="step-top-row">
        <span
          className="step-drag-handle"
          draggable
          title="Drag to reorder"
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          &#x2807;
        </span>
        <span className="step-number">{step.stepNumber}</span>
        <div className="step-text">
          <p
            ref={descRef}
            className="step-description"
            data-step-index={stepIndex}
            title="Click to edit"
            onClick={handleDescClick}
            onBlur={handleDescBlur}
            onKeyDown={handleDescKeyDown}
          >
            {step.description || step.actionType}
          </p>
          {step.url && <p className="step-url">{step.url}</p>}
        </div>
      </div>

      {step.screenshotDataUrl && (
        <div className="step-screenshot-container">
          <img
            className="step-screenshot"
            src={step.screenshotDataUrl}
            alt={`Step ${step.stepNumber}`}
            onClick={(e) => {
              e.stopPropagation();
              onScreenshotClick(
                step.screenshotDataUrl!,
                `Step ${step.stepNumber}`,
              );
            }}
          />
          {hasClickMarker && (
            <div className="click-marker" style={clickMarkerStyle}>
              <div className="click-marker-pulse" />
              <div className="click-marker-ring" />
              <div className="click-marker-dot" />
            </div>
          )}
        </div>
      )}

      <button
        className="step-delete"
        data-step={step.stepNumber}
        title="Delete step"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(step.stepNumber);
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#A8A29E"
          strokeWidth="2"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}
