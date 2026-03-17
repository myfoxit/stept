import React, { useEffect, useRef, useState } from 'react';
import { sendToBackground } from '@/shared/messages';
import type { Step } from '../App';
import StepCard from './StepCard';

interface StepsListProps {
  steps: Step[];
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  refreshState: () => Promise<void>;
}

export default function StepsList({ steps, setSteps, refreshState }: StepsListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [zoomedScreenshot, setZoomedScreenshot] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  // Scroll to bottom when steps change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [steps.length]);

  const handleDelete = async (stepNumber: number) => {
    await sendToBackground({ type: 'DELETE_STEP', stepNumber });
    setSteps((prev) => prev.filter((s) => s.stepNumber !== stepNumber));
    await refreshState();
  };

  const handleDescriptionChange = async (stepIndex: number, newDesc: string) => {
    await sendToBackground({
      type: 'SET_STEP_DESCRIPTION',
      stepIndex,
      description: newDesc,
    });
    setSteps((prev) =>
      prev.map((s, i) => (i === stepIndex ? { ...s, description: newDesc } : s)),
    );
  };

  const handleDrop = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const result = await sendToBackground<any>({
      type: 'REORDER_STEPS',
      fromIndex,
      toIndex,
    });
    if (result.steps) {
      setSteps(result.steps);
    }
  };

  return (
    <>
      <div className="steps-list" id="stepsList" ref={listRef}>
        {steps.length === 0 && (
          <div className="empty-state" id="emptyState">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#D6D3D1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <p>Waiting for actions...</p>
            <span>Click or type on the page to record steps</span>
          </div>
        )}
        {steps.map((step, index) => (
          <StepCard
            key={step.stepNumber}
            step={step}
            stepIndex={index}
            isNew={index === steps.length - 1}
            onDelete={handleDelete}
            onDescriptionChange={handleDescriptionChange}
            onDrop={handleDrop}
            onScreenshotClick={(src, alt) => setZoomedScreenshot({ src, alt })}
          />
        ))}
      </div>

      {zoomedScreenshot && (
        <div
          className="screenshot-overlay"
          onClick={() => setZoomedScreenshot(null)}
        >
          <img src={zoomedScreenshot.src} alt={zoomedScreenshot.alt} />
        </div>
      )}
    </>
  );
}
