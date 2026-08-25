import { useRoute, Link } from "wouter";
import { useGetVector } from "@workspace/api-client-react";
import { ArrowLeft, BookOpen, AlertTriangle, Info, ShieldAlert, Code2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function VectorDetail() {
  const [, params] = useRoute("/vectors/:id");
  const vectorId = params?.id || "";
  const { data: vector, isLoading, isError } = useGetVector(vectorId, {
    query: {
      enabled: !!vectorId,
      queryKey: ["/api/vectors", vectorId]
    }
  });

  if (isError) {
    return (
      <div className="space-y-6">
        <Link href="/vectors" className="text-xs font-mono flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> RETURN TO CATALOG
        </Link>
        <Card className="rounded-none border-destructive/50 bg-destructive/5">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <ShieldAlert className="h-10 w-10 text-destructive mb-4" />
            <h2 className="text-lg font-bold font-mono uppercase tracking-widest text-destructive">Vector Not Found</h2>
            <p className="text-sm font-mono text-muted-foreground mt-2">The requested qualification vector does not exist or could not be loaded.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'border-destructive text-destructive bg-destructive/10';
      case 'high': return 'border-primary text-primary bg-primary/10';
      case 'medium': return 'border-accent-foreground text-accent-foreground bg-accent/50';
      case 'low': return 'border-muted-foreground text-muted-foreground bg-muted';
      default: return 'border-border text-muted-foreground bg-muted';
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/vectors" className="text-xs font-mono flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit transition-colors">
        <ArrowLeft className="h-3 w-3" /> RETURN TO CATALOG
      </Link>

      {isLoading || !vector ? (
        <div className="space-y-6">
          <Skeleton className="h-20 w-full rounded-none" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-96 w-full rounded-none" />
            <Skeleton className="h-96 w-full rounded-none" />
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 border-b border-border pb-6">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-bold text-muted-foreground">{vector.id}</span>
              <Badge variant="outline" className={`rounded-none text-[10px] uppercase font-mono px-2 py-0.5 ${getSeverityColor(vector.severity)}`}>
                {vector.severity}
              </Badge>
              <Badge variant="outline" className="rounded-none text-[10px] uppercase font-mono px-2 py-0.5 border-border bg-transparent text-muted-foreground">
                {vector.category}
              </Badge>
              <span className="font-mono text-[10px] text-muted-foreground bg-muted px-2 py-0.5">v{vector.version}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight font-sans">{vector.title}</h1>
            <p className="text-muted-foreground font-mono text-sm max-w-4xl leading-relaxed">
              {vector.description}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="rounded-none border-border/50 shadow-none bg-card/50 flex flex-col">
              <CardHeader className="border-b border-border/50 py-3 bg-muted/30">
                <CardTitle className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-primary" />
                  Exact Input Payload
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden flex">
                <pre className="p-4 w-full overflow-auto text-[11px] font-mono leading-relaxed bg-black text-white dark:bg-black/50 dark:text-gray-300 m-0">
                  {JSON.stringify(vector.input, null, 2)}
                </pre>
              </CardContent>
            </Card>

            <div className="space-y-6 flex flex-col">
              <Card className="rounded-none border-border/50 shadow-none bg-card/50 flex-1 flex flex-col">
                <CardHeader className="border-b border-border/50 py-3 bg-muted/30">
                  <CardTitle className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-accent-foreground" />
                    Expected Canonical Result
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden flex">
                  <pre className="p-4 w-full overflow-auto text-[11px] font-mono leading-relaxed bg-black/90 text-primary-foreground m-0">
                    {JSON.stringify(vector.expected, null, 2)}
                  </pre>
                </CardContent>
              </Card>

              <Card className="rounded-none border-border/50 shadow-none bg-muted/20">
                <CardHeader className="border-b border-border/50 py-3 bg-muted/50">
                  <CardTitle className="text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    Protocol Citation
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <p className="font-mono text-sm leading-relaxed text-foreground">
                    {vector.citation}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
