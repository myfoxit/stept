import * as React from 'react';
import type { ZoomState } from '@/types/workflow';

export function useZoomPan() {
  const [zoomStates, setZoomStates] = React.useState<Record<number, ZoomState>>({});
  const imageRefs = React.useRef<Record<number, HTMLDivElement | null>>({});
  const zoomLevels = React.useMemo(() => [1, 1.5, 2, 2.5, 3], []);
  
  const [isPanning, setIsPanning] = React.useState(false);
  const [panStart, setPanStart] = React.useState<{
    stepNumber: number;
    x: number;
    y: number;
    origX: number;
    origY: number;
  } | null>(null);

  const clampTranslate = (
    translateX: number,
    translateY: number,
    stepNumber: number,
    scale: number,
  ) => {
    const container = imageRefs.current[stepNumber];
    if (!container) return { translateX, translateY };

    const rect = container.getBoundingClientRect();
    const maxX = (rect.width * (scale - 1)) / 2;
    const maxY = (rect.height * (scale - 1)) / 2;

    return {
      translateX: Math.max(Math.min(translateX, maxX), -maxX),
      translateY: Math.max(Math.min(translateY, maxY), -maxY),
    };
  };

  const focusOnPoint = (
    stepNumber: number,
    clickPosition: { x: number; y: number },
    scale: number,
  ) => {
    const container = imageRefs.current[stepNumber];
    if (!container) return { translateX: 0, translateY: 0 };

    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rawX = (centerX - clickPosition.x) * (scale - 1);
    const rawY = (centerY - clickPosition.y) * (scale - 1);

    return clampTranslate(rawX, rawY, stepNumber, scale);
  };

  const setZoomLevel = (
    stepNumber: number,
    newLevel: number,
    clickPosition?: { x: number; y: number },
  ) => {
    setZoomStates(prev => {
      const level = Math.max(0, Math.min(newLevel, zoomLevels.length - 1));
      const scale = zoomLevels[level];

      const existing = prev[stepNumber];
      const baseX = existing?.translateX ?? 0;
      const baseY = existing?.translateY ?? 0;

      let translated;
      if (level === 0) {
        translated = { translateX: 0, translateY: 0 };
      } else if (clickPosition) {
        translated = focusOnPoint(stepNumber, clickPosition, scale);
      } else {
        translated = clampTranslate(baseX, baseY, stepNumber, scale);
      }

      return {
        ...prev,
        [stepNumber]: {
          stepNumber,
          zoomLevel: level,
          translateX: translated.translateX,
          translateY: translated.translateY,
        },
      };
    });
  };

  const handleZoomIn = (
    stepNumber: number,
    clickPosition?: { x: number; y: number },
  ) => {
    const current = zoomStates[stepNumber];
    const currentLevel = current?.zoomLevel ?? 0;
    setZoomLevel(stepNumber, currentLevel + 1, clickPosition);
  };

  const handleZoomOut = (stepNumber: number) => {
    const current = zoomStates[stepNumber];
    const currentLevel = current?.zoomLevel ?? 0;
    setZoomLevel(stepNumber, currentLevel - 1);
  };

  const handlePanStart = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    stepNumber: number,
  ) => {
    const state = zoomStates[stepNumber];
    const level = state?.zoomLevel ?? 0;
    if (level === 0) return;

    const point =
      'touches' in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };

    setIsPanning(true);
    setPanStart({
      stepNumber,
      x: point.x,
      y: point.y,
      origX: state?.translateX ?? 0,
      origY: state?.translateY ?? 0,
    });
  };

  const handlePanMove = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) => {
    if (!isPanning || !panStart) return;

    const point =
      'touches' in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };

    const dx = point.x - panStart.x;
    const dy = point.y - panStart.y;

    setZoomStates(prev => {
      const state = prev[panStart.stepNumber];
      if (!state) return prev;

      const scale = zoomLevels[state.zoomLevel];
      const rawX = panStart.origX + dx;
      const rawY = panStart.origY + dy;
      const clamped = clampTranslate(rawX, rawY, panStart.stepNumber, scale);

      return {
        ...prev,
        [panStart.stepNumber]: {
          ...state,
          translateX: clamped.translateX,
          translateY: clamped.translateY,
        },
      };
    });
  };

  const handlePanEnd = () => {
    setIsPanning(false);
    setPanStart(null);
  };

  return {
    zoomStates,
    imageRefs,
    zoomLevels,
    handleZoomIn,
    handleZoomOut,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
  };
}
