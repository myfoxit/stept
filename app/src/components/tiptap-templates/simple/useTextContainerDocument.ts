import { useCallback } from 'react';
import {
  useTextContainer as useTextContainerData,
  useCreateTextContainer,
} from '@/hooks/api/documents';

export function useTextContainerDocument(
  containerId?: string,
  containerName?: string
) {
  // If no containerId is provided, we assume we are creating a new text container
  const { data: container, isLoading: containerLoading } =
    useTextContainerData(containerId);

  const createTextContainer = useCreateTextContainer();

  const isLoading = containerLoading;

  const save = useCallback(
    (content: unknown) =>
      createTextContainer.mutate({
        name: containerName || 'Untitled',

        content,
      }),
    [createTextContainer, containerId]
  );

  return { isLoading, container, save } as const;
}
