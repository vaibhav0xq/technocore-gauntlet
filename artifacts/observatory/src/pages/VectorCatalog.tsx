import { Link } from "wouter";
import { useListVectors } from "@workspace/api-client-react";
import { Database, Search, ArrowRight, AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function VectorCatalog() {
  const { data: vectorsData, isLoading } = useListVectors();
  const [search, setSearch] = useState("");

  const filteredVectors = vectorsData?.items.filter(v => 
    v.title.toLowerCase().includes(search.toLowerCase()) || 
    v.id.toLowerCase().includes(search.toLowerCase()) ||
    v.category.toLowerCase().includes(search.toLowerCase())
  );

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <ShieldAlert className="h-4 w-4 text-destructive" />;
      case 'high': return <AlertTriangle className="h-4 w-4 text-primary" />;
      case 'medium': return <AlertTriangle className="h-4 w-4 text-accent-foreground" />;
      case 'low': return <Info className="h-4 w-4 text-muted-foreground" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

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
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <h1 className="text-3xl font-black tracking-tight font-sans uppercase">Vector Catalog</h1>
        <p className="text-muted-foreground font-mono text-sm max-w-3xl">
          Complete inventory of conformance test vectors. Each vector specifies exact inputs and expected canonical outputs.
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search vectors by ID, title, or category..." 
            className="pl-9 font-mono rounded-none border-border/50 h-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="text-xs font-mono text-muted-foreground ml-auto">
          {vectorsData?.items.length || 0} TOTAL VECTORS
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-24 w-full rounded-none" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredVectors?.map((vector) => (
            <Link key={vector.id} href={`/vectors/${vector.id}`}>
              <Card className="rounded-none border-border/50 hover:border-primary transition-colors cursor-pointer group bg-card/50">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className="pt-1">
                      {getSeverityIcon(vector.severity)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-muted-foreground">{vector.id}</span>
                        <h3 className="font-sans font-bold text-base group-hover:text-primary transition-colors">{vector.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`rounded-none text-[10px] uppercase font-mono px-1.5 py-0 ${getSeverityColor(vector.severity)}`}>
                          {vector.severity}
                        </Badge>
                        <Badge variant="outline" className="rounded-none text-[10px] uppercase font-mono px-1.5 py-0 border-border bg-transparent text-muted-foreground">
                          {vector.category}
                        </Badge>
                        <span className="font-mono text-[10px] text-muted-foreground">v{vector.version}</span>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors group-hover:translate-x-1" />
                </CardContent>
              </Card>
            </Link>
          ))}
          {filteredVectors?.length === 0 && (
            <div className="py-12 text-center border border-dashed border-border/50">
              <Database className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-20" />
              <h3 className="font-mono font-bold text-sm">NO VECTORS MATCH QUERY</h3>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
