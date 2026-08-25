import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";

import { Shell } from "@/components/layout/Shell";
import { Workbench } from "@/pages/Workbench";
import { VectorCatalog } from "@/pages/VectorCatalog";
import { VectorDetail } from "@/pages/VectorDetail";
import { RunHistory } from "@/pages/RunHistory";
import { RunDetail } from "@/pages/RunDetail";
import { ImportBundle } from "@/pages/ImportBundle";
import { ChaosMode } from "@/pages/ChaosMode";
import { Verify } from "@/pages/Verify";
import { Protocol } from "@/pages/Protocol";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Workbench} />
          <Route path="/vectors" component={VectorCatalog} />
          <Route path="/vectors/:id" component={VectorDetail} />
          <Route path="/runs" component={RunHistory} />
          <Route path="/runs/:id" component={RunDetail} />
          <Route path="/imports" component={ImportBundle} />
          <Route path="/chaos" component={ChaosMode} />
          <Route path="/verify" component={Verify} />
          <Route path="/protocol" component={Protocol} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
