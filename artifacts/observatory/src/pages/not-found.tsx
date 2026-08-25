import { Card, CardContent } from '@/components/ui/card';
import { Terminal } from 'lucide-react';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <Terminal className="h-16 w-16 text-primary mx-auto mb-6 opacity-80" />
        <h1 className="text-4xl font-black font-sans uppercase tracking-tighter">
          404 Not Found
        </h1>

        <Card className="rounded-none border-primary/50 bg-primary/5">
          <CardContent className="pt-6">
            <p className="font-mono text-sm text-foreground mb-4">
              <span className="text-primary font-bold mr-2">ERR_BAD_ROUTE:</span>
              The requested instrument panel or diagnostic route does not exist.
            </p>
            <div className="font-mono text-xs text-muted-foreground p-3 bg-black/90 text-primary-foreground text-left">
              $ cd /<br/>
              $ return to workbench
            </div>

            <div className="mt-6">
              <Link href="/" className="inline-flex items-center justify-center whitespace-nowrap h-10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full">
                Back to Workbench
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
