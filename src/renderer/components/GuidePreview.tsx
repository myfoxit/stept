import React, { useState, useEffect } from 'react';
import { AnnotatedStep } from '../../main/preload';
import { useElectronAPI } from '../hooks/useElectronAPI';

interface GuidePreviewProps {
  steps: AnnotatedStep[];
  onClose: () => void;
}

interface GuideSection {
  title: string;
  content: string;
  steps: number[];
}

const GuidePreview: React.FC<GuidePreviewProps> = ({ steps, onClose }) => {
  const electronAPI = useElectronAPI();
  const [guide, setGuide] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown'>('preview');

  // Generate guide when component mounts
  useEffect(() => {
    generateGuide();
  }, []);

  const generateGuide = async () => {
    if (!electronAPI) {
      setError('Electron API not available');
      return;
    }

    if (steps.length === 0) {
      setError('No steps available to generate guide');
      return;
    }

    try {
      setIsGenerating(true);
      setIsStreaming(true);
      setError(null);
      setGuide('');

      // Convert AnnotatedStep to RecordedStep for guide generation
      const recordedSteps = steps.map(step => ({
        stepNumber: step.stepNumber,
        timestamp: step.timestamp,
        actionType: step.actionType,
        windowTitle: step.windowTitle,
        description: step.description,
        screenshotPath: step.screenshotPath,
        globalMousePosition: step.globalMousePosition,
        relativeMousePosition: step.relativeMousePosition,
        windowSize: step.windowSize,
        screenshotRelativeMousePosition: step.screenshotRelativeMousePosition,
        screenshotSize: step.screenshotSize,
        textTyped: step.textTyped,
        scrollDelta: step.scrollDelta,
        elementName: step.elementName,
      }));

      const generatedGuide = await electronAPI.generateGuide(recordedSteps);
      
      // Simulate streaming effect for better UX
      await simulateStreaming(generatedGuide);
      
      setIsStreaming(false);
    } catch (error) {
      console.error('Failed to generate guide:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate guide');
      setIsStreaming(false);
    } finally {
      setIsGenerating(false);
    }
  };

  // Simulate streaming effect
  const simulateStreaming = async (fullGuide: string) => {
    const words = fullGuide.split(' ');
    let currentGuide = '';

    for (let i = 0; i < words.length; i++) {
      currentGuide += (i > 0 ? ' ' : '') + words[i];
      setGuide(currentGuide);
      
      // Add a small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };

  // Parse markdown into structured sections
  const parseGuide = (markdownText: string): GuideSection[] => {
    const lines = markdownText.split('\n');
    const sections: GuideSection[] = [];
    let currentSection: GuideSection | null = null;

    for (const line of lines) {
      if (line.startsWith('# ') || line.startsWith('## ')) {
        // Save previous section
        if (currentSection) {
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          title: line.replace(/^#+\s*/, ''),
          content: '',
          steps: [],
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
        
        // Extract step references
        const stepMatches = line.match(/step\s+(\d+)/gi);
        if (stepMatches) {
          stepMatches.forEach(match => {
            const stepNum = parseInt(match.replace(/step\s+/i, ''));
            if (!currentSection!.steps.includes(stepNum)) {
              currentSection!.steps.push(stepNum);
            }
          });
        }
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  };

  // Render markdown as HTML (simple implementation)
  const renderMarkdown = (text: string) => {
    return text
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold text-gray-900 mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold text-gray-900 mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold text-gray-900 mt-8 mb-4">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm font-mono">$1</code>')
      .replace(/^\d+\.\s(.*)$/gim, '<li class="mb-1">$1</li>')
      .replace(/^-\s(.*)$/gim, '<li class="mb-1">$1</li>')
      .replace(/\n/g, '<br>');
  };

  const sections = guide ? parseGuide(guide) : [];

  // Copy guide to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(guide);
      // Show success feedback (you might want to add a toast notification)
      console.log('Guide copied to clipboard');
    } catch (error) {
      console.error('Failed to copy guide:', error);
    }
  };

  // Save guide to file
  const saveToFile = async () => {
    if (!electronAPI) return;
    
    // In a real implementation, you might want to show a save dialog
    // For now, we'll just save to a default location or show in folder
    try {
      // This is a placeholder - you'd implement actual file saving
      console.log('Save guide functionality would be implemented here');
    } catch (error) {
      console.error('Failed to save guide:', error);
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog-content max-w-6xl h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Guide Preview</h2>
            <p className="text-sm text-gray-600 mt-1">
              AI-generated guide from {steps.length} recorded steps
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Tab switcher */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  activeTab === 'preview'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setActiveTab('markdown')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  activeTab === 'markdown'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Markdown
              </button>
            </div>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isGenerating && !guide && (
            <div className="h-full flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Generating Guide...</h3>
              <p className="text-gray-600 text-center max-w-md">
                Our AI is analyzing your {steps.length} recorded steps to create a comprehensive guide.
              </p>
            </div>
          )}

          {error && (
            <div className="h-full flex flex-col items-center justify-center">
              <span className="text-6xl mb-4">⚠️</span>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Generate Guide</h3>
              <p className="text-gray-600 text-center mb-4">{error}</p>
              <button
                onClick={generateGuide}
                className="btn-primary"
              >
                Try Again
              </button>
            </div>
          )}

          {guide && (
            <div className="h-full flex">
              {/* Main content */}
              <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
                {activeTab === 'preview' ? (
                  <div className="prose prose-lg max-w-none">
                    <div
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(guide) }}
                      className="space-y-4"
                    />
                    
                    {isStreaming && (
                      <div className="flex items-center space-x-2 mt-4">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                        <span className="text-sm text-gray-500">Generating...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <pre className="text-sm bg-gray-50 p-4 rounded-lg overflow-auto whitespace-pre-wrap font-mono">
                    {guide}
                  </pre>
                )}
              </div>

              {/* Sidebar with step references */}
              {sections.length > 0 && activeTab === 'preview' && (
                <div className="w-64 border-l border-gray-200 p-4 overflow-y-auto scrollbar-thin">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Sections</h4>
                  <div className="space-y-3">
                    {sections.map((section, index) => (
                      <div key={index} className="text-sm">
                        <h5 className="font-medium text-gray-800 mb-1">
                          {section.title}
                        </h5>
                        {section.steps.length > 0 && (
                          <div className="text-xs text-gray-600">
                            References steps: {section.steps.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <hr className="my-4" />

                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Recording Steps</h4>
                  <div className="space-y-2">
                    {steps.slice(0, 10).map((step) => (
                      <div key={step.stepNumber} className="text-xs bg-gray-50 p-2 rounded">
                        <div className="font-medium text-gray-800">
                          Step {step.stepNumber}
                        </div>
                        <div className="text-gray-600 truncate">
                          {step.isAnnotated && step.generatedTitle 
                            ? step.generatedTitle 
                            : step.description
                          }
                        </div>
                      </div>
                    ))}
                    {steps.length > 10 && (
                      <div className="text-xs text-gray-500 text-center">
                        ... and {steps.length - 10} more steps
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {guide && (
          <div className="flex items-center justify-between p-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Generated from {steps.length} recorded steps • {guide.split(' ').length} words
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={copyToClipboard}
                className="btn-secondary text-sm"
                title="Copy guide to clipboard"
              >
                📋 Copy
              </button>
              
              <button
                onClick={saveToFile}
                className="btn-secondary text-sm"
                title="Save guide to file"
              >
                💾 Save
              </button>
              
              <button
                onClick={generateGuide}
                disabled={isGenerating}
                className="btn-secondary text-sm"
                title="Regenerate guide"
              >
                🔄 Regenerate
              </button>
              
              <button
                onClick={onClose}
                className="btn-primary text-sm"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuidePreview;