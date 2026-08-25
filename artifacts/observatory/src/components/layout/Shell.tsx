import { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-background font-sans text-foreground selection:bg-primary selection:text-primary-foreground">
        <AppSidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden">
          <div className="flex-1 overflow-auto bg-background p-6">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
