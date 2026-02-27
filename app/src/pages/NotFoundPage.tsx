import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GalleryVerticalEnd } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 text-center">
      <a href="/" className="flex items-center gap-2 font-medium">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
          <GalleryVerticalEnd className="size-5" />
        </div>
        <span className="text-xl font-semibold">ondoki</span>
      </a>
      <div className="space-y-2">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <p className="text-lg text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
      </div>
      <Button onClick={() => navigate('/')} size="lg">
        Go Home
      </Button>
    </div>
  );
}
