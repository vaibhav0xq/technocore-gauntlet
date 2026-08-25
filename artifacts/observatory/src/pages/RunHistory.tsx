import { Link } from "wouter";
import { useListRuns } from "@workspace/api-client-react";
import {
  History,
  ArrowRight,
  CheckCircle,
  XCircle,
  Zap,
  Cpu,
  Upload,
  AlertTriangle,
  CircleOff,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export function RunHistory() {
  const { data: runsData, isLoading } = useListRuns({ limit: 50 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <h1 className="text-3xl font-black tracking-tight font-sans uppercase">
          Run History
        </h1>
        <p className="text-muted-foreground font-mono text-sm max-w-3xl">
          Historical log of standard, chaos, and imported qualification runs.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-none" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {runsData?.items.map((run) => (
            <Link key={run.id} href={`/runs/${run.id}`}>
              <Card className="rounded-none border-border/50 hover:border-primary transition-colors cursor-pointer group bg-card/50">
                <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4 lg:items-center">
                    {run.status === "passed" ? (
                      <CheckCircle className="h-6 w-6 text-primary flex-shrink-0" />
                    ) : run.status === "incomplete" ? (
                      <CircleOff className="h-6 w-6 flex-shrink-0 text-orange-500" />
                    ) : run.status === "error" ? (
                      <ShieldAlert className="h-6 w-6 flex-shrink-0 text-destructive" />
                    ) : run.summary?.divergences &&
                      run.summary.divergences.length > 0 ? (
                      <AlertTriangle className="h-6 w-6 text-orange-500 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                    )}
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="break-all font-mono text-xs font-bold text-foreground">
                          {run.id}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {format(
                            new Date(run.startedAt),
                            "yyyy-MM-dd HH:mm:ss.SSS",
                          )}
                        </span>
                        {run.mode === "chaos" && (
                          <Badge
                            variant="outline"
                            className="rounded-none border-accent-foreground text-accent-foreground bg-accent/20 px-1.5 py-0 text-[9px] h-4 font-mono uppercase"
                          >
                            <Zap className="h-3 w-3 mr-1" /> Chaos
                          </Badge>
                        )}
                        {run.mode === "standard" && (
                          <Badge
                            variant="outline"
                            className="rounded-none border-border text-muted-foreground px-1.5 py-0 text-[9px] h-4 font-mono uppercase"
                          >
                            Standard
                          </Badge>
                        )}
                        {run.provenance?.kind === "import" && (
                          <Badge
                            variant="outline"
                            className="rounded-none border-blue-500 text-blue-500 bg-blue-500/10 px-1.5 py-0 text-[9px] h-4 font-mono uppercase"
                          >
                            <Upload className="h-3 w-3 mr-1" /> Imported
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={`h-4 rounded-none px-1.5 py-0 font-mono text-[9px] uppercase ${
                            run.status === "passed"
                              ? "border-primary text-primary"
                              : run.status === "incomplete"
                                ? "border-orange-500 text-orange-500"
                                : "border-destructive text-destructive"
                          }`}
                        >
                          {run.status === "failed" &&
                          run.summary?.divergences.length
                            ? "divergence"
                            : run.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 font-mono text-[10px]">
                        <span className="text-muted-foreground flex items-center gap-1">
                          SUITE{" "}
                          <span className="text-foreground font-bold">
                            {run.suiteId}
                          </span>{" "}
                          <span className="opacity-50">
                            v{run.suiteVersion}
                          </span>
                        </span>
                        {run.implementationIds &&
                        run.implementationIds.length > 1 ? (
                          <span className="text-primary flex items-center gap-1">
                            <Cpu className="h-3 w-3" /> MULTI-RUNNER (
                            {run.implementationIds.length})
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            IMPL{" "}
                            <span className="text-foreground font-bold">
                              {run.implementationId}
                            </span>
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          SEED{" "}
                          <span className="text-foreground font-bold truncate max-w-[100px] inline-block align-bottom">
                            {run.seed}
                          </span>
                        </span>
                        {run.summary?.divergences &&
                          run.summary.divergences.length > 0 && (
                            <span className="text-destructive font-bold uppercase">
                              {run.summary.divergences.length} DIVERGENCES
                            </span>
                          )}
                        {run.replayOf && (
                          <span className="text-accent-foreground flex items-center">
                            <History className="h-3 w-3 mr-1" /> REPLAY
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-6 border-t border-border/50 pt-3 lg:border-t-0 lg:pt-0">
                    <div className="flex flex-wrap items-center justify-end gap-4 font-mono text-xs">
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground text-[10px]">
                          PASSED
                        </span>
                        <span className="text-primary font-bold">
                          {run.counts.passed}
                        </span>
                      </div>
                      {run.counts.unsupported !== undefined && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-muted-foreground">
                            UNSUPPORTED
                          </span>
                          <span className="font-bold text-orange-500">
                            {run.counts.unsupported}
                          </span>
                        </div>
                      )}
                      {run.counts.errors > 0 && (
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] text-muted-foreground">
                            ERRORS
                          </span>
                          <span className="font-bold text-destructive">
                            {run.counts.errors}
                          </span>
                        </div>
                      )}
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground text-[10px]">
                          FAILED
                        </span>
                        <span
                          className={
                            run.counts.failed > 0
                              ? "text-destructive font-bold"
                              : "text-foreground font-bold"
                          }
                        >
                          {run.counts.failed}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground text-[10px]">
                          TOTAL
                        </span>
                        <span className="text-foreground font-bold">
                          {run.counts.total}
                        </span>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
          {runsData?.items.length === 0 && (
            <div className="py-12 text-center border border-dashed border-border/50">
              <History className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-20" />
              <h3 className="font-mono font-bold text-sm">NO HISTORY FOUND</h3>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
