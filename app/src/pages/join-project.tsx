import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { apiClient } from '@/lib/apiClient';
import { IconLoader2 } from '@tabler/icons-react';
import { useMe } from '@/hooks/api/auth';

export function JoinProjectPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: currentUser } = useMe();
  const [isJoining, setIsJoining] = useState(false);
  const [projectInfo, setProjectInfo] = useState<any>(null);
  
  const token = searchParams.get('token');
  
  useEffect(() => {
    if (token) {
      try {
      
        const decoded = atob(token);
        const parsed = JSON.parse(decoded);
        setProjectInfo({
          projectId: parsed.project_id,
          role: parsed.role,
          expiresAt: parsed.expires_at
        });
      } catch (error) {
        
        console.debug('Could not decode token for preview:', error);
       
        setProjectInfo({ role: 'member' });
      }
    }
  }, [token]);
  
  const handleJoinProject = async () => {
    if (!token) {
      toast.error('Invalid invite link');
      return;
    }
    
    setIsJoining(true);
    
    try {
      const response = await apiClient.post('/projects/join', { token });
      
      if (response.data.status === 'already_member') {
        toast.info('Already a member', {
          description: 'You are already a member of this project.',
        });
      } else {
        toast.success('Success!', {
          description: 'You have successfully joined the project.',
        });
      }
      
   
      navigate(`/projects/${response.data.project_id || projectInfo?.projectId}`);
    } catch (error: any) {
      toast.error('Failed to join project', {
        description: error.response?.data?.detail || 'An error occurred while joining the project.',
      });
    } finally {
      setIsJoining(false);
    }
  };
  
  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>
              Please sign in to join this project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={() => navigate(`/login?return_to=${window.location.href}`)}
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Join Project</CardTitle>
          <CardDescription>
            You've been invited to join a project
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {projectInfo && (
            <div className="text-sm text-muted-foreground">
              {projectInfo.projectId && <p>Project ID: {projectInfo.projectId}</p>}
              <p>Role: {projectInfo.role}</p>
              {projectInfo.expiresAt && (
                <p>Expires: {new Date(projectInfo.expiresAt).toLocaleDateString()}</p>
              )}
            </div>
          )}
          
          <Button 
            className="w-full" 
            onClick={handleJoinProject}
            disabled={isJoining}
          >
            {isJoining && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isJoining ? 'Joining...' : 'Join Project'}
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => navigate('/')}
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
