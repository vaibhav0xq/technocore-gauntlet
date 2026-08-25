import { useMemo } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useGetRun, useReplayRun } from "@workspace/api-client-react";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Zap,
  Clock,
  ShieldAlert,
  BookOpen,
  AlertTriangle,
  Code2,
  RefreshCw,
  Cpu,
  Upload,
  Download,
  CircleOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api-url";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export function RunDetail() {
  const [, params] = useRoute("/runs/:id");
  const runId = params?.id || "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const replayRun = useReplayRun();

  const {
    data: run,
    isLoading,
    isError,
  } = useGetRun(runId, {
    query: {
      enabled: !!runId,
      queryKey: ["/api/runs", runId],
    },
  });

  const implementationStats = useMemo(() => {
    if (!run) return [];
    const implementations = run.implementations ?? [];
    return implementations.map((implementation) => {
      const cases = run.cases.filter(
        (item) => item.implementationId === implementation.id,
      );
      return {
        implementation,
        passed: cases.filter((item) => item.status === "pass").length,
        failed: cases.filter((item) => item.status === "fail").length,
        unsupported: cases.filter((item) => item.status === "unsupported")
          .length,
        errors: cases.filter((item) => item.status === "error").length,
      };
    });
  }, [run]);

  const handleReplay = () => {
    if (!runId) return;
    replayRun.mutate(
      {
        id: runId,
        data: {},
      },
      {
        onSuccess: (replay) => {
          queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
          setLocation(`/runs/${replay.id}`);
        },
      },
    );
  };

  const handleDownload = (format: "json" | "junit") => {
    const exportPath = `/api/runs/${encodeURIComponent(runId)}/export?format=${format}`;
    window.location.assign(getApiUrl(exportPath));
  };

  if (isError) {
    return (
      <div className="space-y-6">
        <Link
          href="/runs"
          className="text-xs font-mono flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> RETURN TO HISTORY
        </Link>
        <Card className="rounded-none border-destructive/50 bg-destructive/5">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center">
            <ShieldAlert className="h-10 w-10 text-destructive mb-4" />
            <h2 className="text-lg font-bold font-mono uppercase tracking-widest text-destructive">
              Run Not Found
            </h2>
            <p className="text-sm font-mono text-muted-foreground mt-2">
              The requested qualification run could not be loaded.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isMulti = run?.implementations && run.implementations.length > 1;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
        <Link
          href="/runs"
          className="text-xs font-mono flex items-center gap-2 text-muted-foreground hover:text-foreground w-fit transition-colors"
        >
          <ArrowLeft className="h-3 w-3" /> RETURN TO HISTORY
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {run && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="rounded-none font-mono text-xs uppercase tracking-widest border-border text-foreground hover:bg-muted/50"
                onClick={() => handleDownload("json")}
              >
                <Download className="h-3 w-3 mr-2" /> JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-none font-mono text-xs uppercase tracking-widest border-border text-foreground hover:bg-muted/50"
                onClick={() => handleDownload("junit")}
              >
                <Download className="h-3 w-3 mr-2" /> JUnit
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-none font-mono text-xs uppercase tracking-widest"
            onClick={handleReplay}
            disabled={
              replayRun.isPending || !run || run.provenance?.kind === "import"
            }
          >
            <RefreshCw
              className={`h-3 w-3 mr-2 ${replayRun.isPending ? "animate-spin" : ""}`}
            />
            Replay Exact Condition
          </Button>
        </div>
      </div>

      {isLoading || !run ? (
        <div className="space-y-6">
          <Skeleton className="h-32 w-full rounded-none" />
          <Skeleton className="h-64 w-full rounded-none" />
        </div>
      ) : (
        <>
          <Card
            className={`rounded-none border-t-4 shadow-none ${
              run.status === "passed"
                ? "border-t-primary"
                : run.status === "incomplete"
                  ? "border-t-orange-500"
                  : "border-t-destructive"
            }`}
          >
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-4 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="min-w-0 break-all font-mono text-xl font-black tracking-tight sm:text-2xl lg:text-3xl">
                      {run.id}
                    </h1>
                    {run.status === "passed" ? (
                      <Badge
                        variant="outline"
                        className="rounded-none border-primary text-primary bg-primary/10 text-xs font-mono uppercase px-2 py-0.5"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Passed
                      </Badge>
                    ) : run.status === "incomplete" ? (
                      <Badge
                        variant="outline"
                        className="rounded-none border-orange-500 bg-orange-500/10 px-2 py-0.5 font-mono text-xs uppercase text-orange-500"
                      >
                        <CircleOff className="mr-1 h-3 w-3" /> Incomplete
                        Coverage
                      </Badge>
                    ) : run.status === "error" ? (
                      <Badge
                        variant="outline"
                        className="rounded-none border-destructive bg-destructive/10 px-2 py-0.5 font-mono text-xs uppercase text-destructive"
                      >
                        <ShieldAlert className="mr-1 h-3 w-3" /> Adapter Error
                      </Badge>
                    ) : run.summary?.divergences &&
                      run.summary.divergences.length > 0 ? (
                      <Badge
                        variant="outline"
                        className="rounded-none border-orange-500 text-orange-500 bg-orange-500/10 text-xs font-mono uppercase px-2 py-0.5"
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" /> Protocol
                        Divergence
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="rounded-none border-destructive text-destructive bg-destructive/10 text-xs font-mono uppercase px-2 py-0.5"
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Conformance Failure
                      </Badge>
                    )}
                    {run.mode === "chaos" && (
                      <Badge
                        variant="outline"
                        className="rounded-none border-accent-foreground text-accent-foreground bg-accent/20 text-xs font-mono uppercase px-2 py-0.5"
                      >
                        <Zap className="h-3 w-3 mr-1" /> Chaos Mode
                      </Badge>
                    )}
                    {run.provenance?.kind === "import" && (
                      <Badge
                        variant="outline"
                        className="rounded-none border-blue-500 text-blue-500 bg-blue-500/10 text-xs font-mono uppercase px-2 py-0.5"
                      >
                        <Upload className="h-3 w-3 mr-1" /> Imported
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 font-mono text-xs">
                    <div>
                      <div className="text-muted-foreground mb-1 uppercase tracking-widest text-[10px]">
                        Suite
                      </div>
                      <div className="font-bold">
                        {run.suiteId}{" "}
                        <span className="text-muted-foreground font-normal">
                          v{run.suiteVersion}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1 uppercase tracking-widest text-[10px]">
                        {isMulti ? "Implementations" : "Implementation"}
                      </div>
                      {isMulti ? (
                        <div className="font-bold flex items-center gap-1">
                          <Cpu className="h-3 w-3 text-primary" /> Multi (
                          {run.implementations?.length})
                        </div>
                      ) : (
                        <div className="font-bold">{run.implementationId}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1 uppercase tracking-widest text-[10px]">
                        Seed (Deterministic)
                      </div>
                      <div
                        className="font-bold text-accent-foreground truncate"
                        title={run.seed}
                      >
                        {run.seed}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-1 uppercase tracking-widest text-[10px]">
                        Timestamp
                      </div>
                      <div className="font-bold">
                        {format(new Date(run.startedAt), "yyyy-MM-dd HH:mm:ss")}
                      </div>
                    </div>
                  </div>
                  {run.replayOf && (
                    <div className="border-l-2 border-primary pl-3 font-mono text-[10px] uppercase tracking-widest">
                      <span className="text-muted-foreground">
                        Exact replay of{" "}
                      </span>
                      <Link
                        href={`/runs/${run.replayOf}`}
                        className="font-bold text-primary hover:underline underline-offset-4"
                      >
                        {run.replayOf}
                      </Link>
                    </div>
                  )}
                  {run.provenance?.kind === "import" &&
                    run.provenance.sourceDigest && (
                      <div className="border-l-2 border-blue-500 bg-blue-500/5 p-3 font-mono text-[10px]">
                        <div className="font-bold uppercase tracking-widest text-blue-500">
                          Self-reported external evidence
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          Gauntlet verified the bundle structure, canonical
                          vectors, derived outcomes, and transport digest. It
                          did not authenticate who ran the external
                          implementation.
                        </div>
                        <div className="mt-2 uppercase tracking-widest">
                          <span className="text-muted-foreground">
                            Source bundle digest:{" "}
                          </span>
                          <span className="break-all font-bold text-foreground">
                            {run.provenance.sourceDigest}
                          </span>
                        </div>
                        {run.provenance.originalRunId && (
                          <div className="mt-1 uppercase tracking-widest">
                            <span className="text-muted-foreground">
                              Original run ID:{" "}
                            </span>
                            <span className="break-all text-foreground">
                              {run.provenance.originalRunId}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  {(run.contractDigest ||
                    run.vectorDigest ||
                    run.bundleDigest) && (
                    <div className="grid gap-2 border-t border-border/50 pt-3 font-mono text-[10px] sm:grid-cols-3">
                      {[
                        ["Contract", run.contractDigest],
                        ["Vectors", run.vectorDigest],
                        ["Bundle", run.bundleDigest],
                      ].map(
                        ([label, digest]) =>
                          digest && (
                            <div key={label} className="min-w-0">
                              <div className="mb-1 uppercase tracking-widest text-muted-foreground">
                                {label} digest
                              </div>
                              <div className="break-all text-foreground">
                                {digest}
                              </div>
                            </div>
                          ),
                      )}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2 text-center font-mono lg:justify-end">
                  <div className="flex flex-col items-center bg-muted/10 p-3 border border-border/50">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Total
                    </span>
                    <span className="text-2xl font-bold">
                      {run.counts.total}
                    </span>
                  </div>
                  <div className="flex flex-col items-center bg-primary/5 p-3 border border-primary/20">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Passed
                    </span>
                    <span className="text-2xl font-bold text-primary">
                      {run.counts.passed}
                    </span>
                  </div>
                  <div
                    className={`flex flex-col items-center p-3 border ${run.counts.failed > 0 ? "bg-destructive/5 border-destructive/20" : "bg-muted/10 border-border/50"}`}
                  >
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Failed
                    </span>
                    <span
                      className={`text-2xl font-bold ${run.counts.failed > 0 ? "text-destructive" : "text-foreground"}`}
                    >
                      {run.counts.failed}
                    </span>
                  </div>
                  {run.counts.unsupported !== undefined &&
                    run.counts.unsupported > 0 && (
                      <div className="flex flex-col items-center bg-orange-500/5 p-3 border border-orange-500/20">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                          Unsupp
                        </span>
                        <span className="text-2xl font-bold text-orange-500">
                          {run.counts.unsupported}
                        </span>
                      </div>
                    )}
                  {run.counts.errors > 0 && (
                    <div className="flex flex-col items-center border border-destructive/20 bg-destructive/5 p-3">
                      <span className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                        Errors
                      </span>
                      <span className="text-2xl font-bold text-destructive">
                        {run.counts.errors}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {isMulti && run.summary && (
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card className="rounded-none border-primary/30 bg-primary/5 shadow-none">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm uppercase font-bold tracking-wider text-primary">
                    Coverage & Agreement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-muted-foreground uppercase">
                          Supported Matrix
                        </span>
                        <span className="font-bold">
                          {Math.round(run.summary.coveragePercent)}%
                        </span>
                      </div>
                      <div className="w-full bg-background h-2 border border-border/50">
                        <div
                          className="bg-primary h-full"
                          style={{ width: `${run.summary.coveragePercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/50 pt-3 font-mono text-xs">
                      <span className="uppercase text-muted-foreground">
                        Vectors in agreement
                      </span>
                      <span className="font-bold">{run.summary.agreement}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {run.summary.divergences.length > 0 && (
                <Card className="rounded-none border-destructive/30 bg-destructive/5 shadow-none">
                  <CardHeader className="py-4">
                    <CardTitle className="text-sm uppercase font-bold tracking-wider text-destructive">
                      Genuine Divergences
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-2 text-xs font-mono text-foreground">
                      {run.summary.divergences.map((div, i) => (
                        <li key={i} className="leading-tight">
                          {div}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {implementationStats.length > 0 && (
            <Card className="mt-6 rounded-none border-border/50 bg-card/50 shadow-none">
              <CardHeader className="border-b border-border/50 py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-wider">
                  Implementation Matrix
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/50">
                  {implementationStats.map(
                    ({
                      implementation,
                      passed,
                      failed,
                      unsupported,
                      errors,
                    }) => (
                      <div key={implementation.id} className="space-y-4 p-4">
                        <div className="grid gap-4 font-mono text-xs md:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] md:items-start">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-bold">
                                {implementation.name}
                              </div>
                              <Badge
                                variant="outline"
                                className={`rounded-none px-1 py-0 font-mono text-[9px] uppercase ${
                                  implementation.status === "imported"
                                    ? "border-blue-500 text-blue-500"
                                    : "border-primary text-primary"
                                }`}
                              >
                                {implementation.status}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="rounded-none px-1 py-0 font-mono text-[9px] uppercase"
                              >
                                {implementation.kind}
                              </Badge>
                            </div>
                            <div className="mt-1 break-all text-[10px] text-muted-foreground">
                              {implementation.id}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">PASS </span>
                            <span className="font-bold text-primary">
                              {passed}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">FAIL </span>
                            <span
                              className={
                                failed
                                  ? "font-bold text-destructive"
                                  : "font-bold"
                              }
                            >
                              {failed}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              UNSUPPORTED{" "}
                            </span>
                            <span className="font-bold text-orange-500">
                              {unsupported}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              ERROR{" "}
                            </span>
                            <span
                              className={
                                errors
                                  ? "font-bold text-destructive"
                                  : "font-bold"
                              }
                            >
                              {errors}
                            </span>
                          </div>
                        </div>
                        <div className="grid gap-3 border-t border-border/50 pt-3 font-mono text-[10px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <span className="block uppercase tracking-widest">
                              Language / version
                            </span>
                            <span className="text-foreground">
                              {implementation.language} {implementation.version}
                            </span>
                          </div>
                          <div>
                            <span className="block uppercase tracking-widest">
                              License
                            </span>
                            <span className="text-foreground">
                              {implementation.license}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <span className="block uppercase tracking-widest">
                              Source revision
                            </span>
                            <span className="break-all text-foreground">
                              {implementation.sourceRevision}
                            </span>
                          </div>
                          <div>
                            <span className="block uppercase tracking-widest">
                              Capabilities
                            </span>
                            <span className="text-foreground">
                              {implementation.capabilities.join(", ")}
                            </span>
                          </div>
                        </div>
                        <div className="border-l-2 border-border pl-3 font-mono text-[10px] text-muted-foreground">
                          <div>{implementation.certification}</div>
                          <div className="mt-1">
                            {implementation.disclaimer}
                          </div>
                          {implementation.sourceBasis.length > 0 && (
                            <div className="mt-1 break-all">
                              Source basis:{" "}
                              {implementation.sourceBasis.join(", ")}
                            </div>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {run.cases.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-border/50">
              <h3 className="font-mono font-bold text-sm">NO CASES EXECUTED</h3>
            </div>
          ) : (
            <div className="space-y-4 mt-8">
              <h3 className="font-sans font-black uppercase text-xl border-b border-border pb-2">
                Execution Trace
              </h3>
              <div className="space-y-6">
                {run.cases.map((c) => (
                  <Card
                    key={`${c.implementationId ?? run.implementationId}:${c.id}`}
                    className={`rounded-none border-l-4 shadow-none ${
                      c.status === "pass"
                        ? "border-l-primary"
                        : c.status === "unsupported"
                          ? "border-l-orange-500 border-border/50 bg-orange-500/5"
                          : "border-l-destructive border-border/50 bg-destructive/5"
                    }`}
                  >
                    <CardHeader className="py-3 px-4 flex flex-col md:flex-row md:items-center justify-between bg-muted/20 gap-2">
                      <div className="flex items-center gap-3">
                        {c.status === "pass" ? (
                          <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                        ) : c.status === "unsupported" ? (
                          <CircleOff className="h-5 w-5 text-orange-500 shrink-0" />
                        ) : c.status === "error" ? (
                          <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive shrink-0" />
                        )}
                        <span
                          className="font-mono text-xs font-bold text-muted-foreground w-20 truncate"
                          title={c.id}
                        >
                          {c.id}
                        </span>
                        <CardTitle className="text-sm font-sans font-bold">
                          {c.title}
                        </CardTitle>
                        <Badge
                          variant="outline"
                          className="rounded-none text-[9px] uppercase font-mono px-1 py-0 ml-2 hidden sm:inline-flex"
                        >
                          {c.category}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 font-mono text-[10px]">
                        {c.implementationId && isMulti && (
                          <span className="text-primary font-bold px-2 py-0.5 bg-primary/10 border border-primary/20">
                            {c.implementationId}
                          </span>
                        )}
                        {c.status !== "unsupported" && (
                          <span className="flex items-center text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            {c.durationMs}ms
                          </span>
                        )}
                        <a
                          href="#citation"
                          title={c.citation}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <BookOpen className="h-3 w-3" />
                        </a>
                      </div>
                    </CardHeader>

                    {c.status === "unsupported" && (
                      <CardContent className="p-4 border-t border-border/50">
                        <div className="flex items-start gap-2 text-orange-500 font-mono text-xs">
                          <CircleOff className="h-4 w-4 shrink-0" />
                          <span>
                            {c.evidence[0]?.message ??
                              "Implementation explicitly lacks capability to evaluate this vector."}{" "}
                            Included in total coverage denominator but skipped
                            in evaluation.
                          </span>
                        </div>
                      </CardContent>
                    )}

                    {c.status === "error" && (
                      <CardContent className="border-t border-border/50 p-4">
                        <div className="flex items-start gap-2 font-mono text-xs text-destructive">
                          <ShieldAlert className="h-4 w-4 shrink-0" />
                          <div>
                            <div className="font-bold uppercase tracking-widest">
                              Adapter execution error
                            </div>
                            <div className="mt-1 break-words text-foreground">
                              {c.evidence[0]?.message ??
                                "The adapter could not return bounded evidence for this vector."}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    )}

                    {c.status === "fail" && (
                      <CardContent className="p-0 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/50">
                        <div className="p-4 bg-muted/10">
                          <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" /> Expected Output
                          </h4>
                          <pre className="text-[11px] font-mono p-3 bg-black/90 text-primary-foreground overflow-auto">
                            {JSON.stringify(c.expected, null, 2)}
                          </pre>
                          {c.expectedCanonical && (
                            <div className="mt-2">
                              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                                Canonical Hex
                              </span>
                              <pre className="text-[10px] font-mono text-muted-foreground mt-1 break-all">
                                {c.expectedCanonical}
                              </pre>
                            </div>
                          )}
                        </div>
                        <div className="p-4 bg-destructive/10">
                          <h4 className="text-[10px] font-mono uppercase tracking-widest text-destructive mb-2 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Actual Output
                          </h4>
                          <pre className="text-[11px] font-mono p-3 bg-black text-white overflow-auto">
                            {JSON.stringify(c.actual, null, 2)}
                          </pre>
                          {c.actualCanonical && (
                            <div className="mt-2">
                              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                                Canonical Hex
                              </span>
                              <pre className="text-[10px] font-mono text-muted-foreground mt-1 break-all">
                                {c.actualCanonical}
                              </pre>
                            </div>
                          )}

                          {c.byteDiff && (
                            <div className="mt-4 p-3 border border-destructive/30 bg-destructive/5">
                              <h5 className="text-[10px] font-mono uppercase tracking-widest text-destructive mb-2">
                                Byte Difference Analysis
                              </h5>
                              <div className="font-mono text-[10px] space-y-1">
                                <div>
                                  <span className="text-muted-foreground">
                                    First Mismatch At:
                                  </span>{" "}
                                  byte {c.byteDiff.firstMismatch}
                                </div>
                                <div className="mt-2 text-muted-foreground">
                                  Expected:
                                </div>
                                <div className="break-all text-primary font-bold">
                                  {c.byteDiff.expectedUtf8Hex}
                                </div>
                                <div className="mt-2 text-muted-foreground">
                                  Actual:
                                </div>
                                <div className="break-all text-destructive font-bold">
                                  {c.byteDiff.actualUtf8Hex}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    )}

                    {c.status === "pass" && (
                      <CardContent className="p-4 border-t border-border/50">
                        <details className="group">
                          <summary className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-primary transition-colors flex items-center list-none">
                            <Code2 className="h-3 w-3 mr-1" /> Show Assertion
                            Payload
                            <span className="ml-auto opacity-50 group-open:hidden">
                              + EXPAND
                            </span>
                            <span className="ml-auto opacity-50 hidden group-open:inline">
                              - COLLAPSE
                            </span>
                          </summary>
                          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                                Input
                              </span>
                              <pre className="text-[10px] font-mono p-2 bg-black/90 text-primary-foreground overflow-auto mt-1 max-h-40">
                                {JSON.stringify(c.input, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <span className="text-[9px] font-mono text-muted-foreground uppercase">
                                Validated Output
                              </span>
                              <pre className="text-[10px] font-mono p-2 bg-black/90 text-primary-foreground overflow-auto mt-1 max-h-40">
                                {JSON.stringify(c.actual, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </details>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
