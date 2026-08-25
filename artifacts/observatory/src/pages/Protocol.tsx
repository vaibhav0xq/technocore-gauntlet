import {
  useGetProtocol,
  useListImplementations,
} from "@workspace/api-client-react";
import {
  BookOpen,
  ShieldAlert,
  Cpu,
  AlertTriangle,
  FileCode2,
  Scale,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function Protocol() {
  const { data: protocol, isLoading: protocolLoading } = useGetProtocol();
  const { data: implementations, isLoading: implLoading } =
    useListImplementations();

  if (protocolLoading || implLoading || !protocol || !implementations) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-none" />
        <Skeleton className="h-64 w-full rounded-none" />
        <Skeleton className="h-64 w-full rounded-none" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <BookOpen className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black tracking-tight font-sans uppercase">
            Protocol Specification
          </h1>
        </div>
        <p className="text-muted-foreground font-mono text-sm max-w-3xl">
          Normative rules, safety policies, and implementation register for the{" "}
          {protocol.name} protocol. Technocore Gauntlet enforces these
          constraints.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="rounded-none border-primary/30 shadow-none bg-primary/5">
            <CardHeader className="border-b border-primary/20 pb-4 bg-primary/10">
              <CardTitle className="text-sm uppercase font-bold tracking-wider flex items-center gap-2 text-primary">
                <FileCode2 className="h-4 w-4" />
                Normative Constraints
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Canonicalization Strategy
                </h4>
                <div className="font-mono text-sm p-4 bg-black/90 text-primary-foreground border-l-2 border-primary">
                  {protocol.canonicalPayload}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                    Signature Encoding
                  </h4>
                  <div className="font-mono text-sm font-bold">
                    {protocol.signatureEncoding}
                  </div>
                </div>
                <div>
                  <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                    Nonce Monotonicity
                  </h4>
                  <div className="font-mono text-sm font-bold">
                    {protocol.nonceRule}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Text Normalization Sweep Categories
                </h4>
                <div className="flex flex-wrap gap-2">
                  {protocol.sweepCategories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className="rounded-none font-mono text-xs px-2 py-1 bg-background border-border"
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-none border-destructive/30 shadow-none bg-destructive/5">
            <CardHeader className="border-b border-destructive/20 pb-4 bg-destructive/10">
              <CardTitle className="text-sm uppercase font-bold tracking-wider flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-4 w-4" />
                Safety Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex items-center justify-between border-b border-destructive/20 pb-4">
                <span className="font-mono text-xs uppercase tracking-widest text-destructive">
                  Execution Class
                </span>
                <Badge
                  variant="outline"
                  className="rounded-none border-destructive text-destructive font-mono text-xs font-bold px-3 py-1"
                >
                  {protocol.safety.executionClass}
                </Badge>
              </div>

              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-widest text-destructive mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-3 w-3" /> Forbidden Behaviors
                </h4>
                <ul className="list-disc list-inside space-y-1 pl-4 text-xs font-mono text-foreground">
                  {protocol.safety.forbidden.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Pure Local Asserts
                </h4>
                <ul className="list-disc list-inside space-y-1 pl-4 text-xs font-mono text-muted-foreground">
                  {protocol.safety.pureLocal.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-none border-border/50 bg-card/50 shadow-none">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                <Cpu className="h-4 w-4 text-primary" />
                Adapter trust boundary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6 font-mono text-xs text-muted-foreground">
              <p>
                Hosted runs can select only the built-in IDs listed here. Python
                oracles execute through a fixed local worker with bounded JSON
                input, output, and runtime. Requests cannot choose a command,
                repository, path, executable, environment, or network target.
              </p>
              <p>
                Third-party clients run through the operator-owned local CLI.
                Only the resulting versioned JSON evidence bundle can be
                imported here. Import validates digests, vectors, attribution,
                size limits, and provenance without executing uploaded code.
              </p>
              <p>
                Imported evidence is self-reported and unauthenticated. Gauntlet
                independently binds it to canonical vectors and derives
                outcomes, but does not certify that the named external binary
                was the process that produced the supplied actual values.
                Reserved built-in identities cannot be imported.
              </p>
              <p>
                Unsupported vectors remain visible in coverage and are never
                counted as passes. Community and imported results remain
                unofficial even when every supported vector agrees.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-none border-accent-foreground/30 shadow-none bg-card/50">
            <CardHeader className="border-b border-accent-foreground/20 pb-4">
              <CardTitle className="text-sm uppercase font-bold tracking-wider flex items-center gap-2 text-accent-foreground">
                <Scale className="h-4 w-4" />
                Disclaimer
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <p className="text-xs font-mono text-muted-foreground leading-relaxed">
                Technocore Gauntlet is an independent community lab. Passing
                qualification suites in this environment does not constitute an
                official Flop Labs certification. Implementations should undergo
                independent security auditing.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-none border-border/50 shadow-none bg-card/50 h-full">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-sm uppercase font-bold tracking-wider flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                Implementations
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              <div className="divide-y divide-border/50">
                {implementations.items.map((impl) => (
                  <div
                    key={impl.id}
                    className="p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex flex-col gap-2 mb-3">
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold font-sans">{impl.name}</h3>
                        <Badge
                          variant="outline"
                          className={`rounded-none text-[9px] uppercase font-mono px-1 py-0 ${!impl.status || impl.status === "built-in" ? "border-primary text-primary" : "border-blue-500 text-blue-500"}`}
                        >
                          {impl.status || "built-in"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] text-muted-foreground uppercase">
                        <span className="bg-muted px-1.5 py-0.5 border border-border">
                          v{impl.version}
                        </span>
                        <span className="bg-muted px-1.5 py-0.5 border border-border">
                          {impl.language}
                        </span>
                        <span className="bg-muted px-1.5 py-0.5 border border-border">
                          {impl.kind || "reference"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mb-3">
                      <div>
                        <span className="text-muted-foreground block mb-0.5 uppercase tracking-wider">
                          License
                        </span>
                        <span className="font-bold">
                          {impl.license || "Project License"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block mb-0.5 uppercase tracking-wider">
                          Certification
                        </span>
                        <span className="font-bold">{impl.certification}</span>
                      </div>
                    </div>

                    <div className="text-[10px] font-mono mb-3">
                      <span className="text-muted-foreground block mb-1 uppercase tracking-wider">
                        Revision
                      </span>
                      <span className="text-muted-foreground/80 break-all">
                        {impl.sourceRevision || "HEAD"}
                      </span>
                    </div>

                    {(!impl.capabilities || impl.capabilities.length === 0) && (
                      <div className="text-[10px] font-mono mt-3 border-t border-border/50 pt-3">
                        <span className="text-muted-foreground block mb-1.5 uppercase tracking-wider">
                          Capabilities
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="px-1.5 py-0.5 border border-border text-[9px] text-muted-foreground">
                            standard
                          </span>
                          <span className="px-1.5 py-0.5 border border-border text-[9px] text-muted-foreground">
                            chaos
                          </span>
                        </div>
                      </div>
                    )}

                    {impl.capabilities && impl.capabilities.length > 0 && (
                      <div className="text-[10px] font-mono mt-3 border-t border-border/50 pt-3">
                        <span className="text-muted-foreground block mb-1.5 uppercase tracking-wider">
                          Capabilities
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {impl.capabilities.map((cap, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 border border-border text-[9px] text-muted-foreground"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
