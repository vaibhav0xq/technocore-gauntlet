import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Zap, AlertTriangle, ShieldAlert } from "lucide-react";

import { useListSuites, useCreateRun } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

const formSchema = z.object({
  suiteId: z.string().min(1, "Suite is required"),
  seed: z.string().min(1, "Seed is required"),
  unicodeInsertions: z.number().min(0).max(8),
  truncations: z.number().min(0).max(4),
  duplicates: z.number().min(0).max(4),
  reorderings: z.number().min(0).max(4),
  latencyMs: z.number().min(0).max(250),
  jitterMs: z.number().min(0).max(250),
  nonceBoundary: z.boolean(),
});

function generateRandomSeed() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function ChaosMode() {
  const [, setLocation] = useLocation();
  const { data: suitesData, isLoading: suitesLoading } = useListSuites();
  const createRun = useCreateRun();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      suiteId: "",
      seed: generateRandomSeed(),
      unicodeInsertions: 2,
      truncations: 1,
      duplicates: 0,
      reorderings: 1,
      latencyMs: 50,
      jitterMs: 10,
      nonceBoundary: true,
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    createRun.mutate({
      data: {
        suiteId: values.suiteId,
        seed: values.seed,
        mode: "chaos",
        config: {
          unicodeInsertions: values.unicodeInsertions,
          truncations: values.truncations,
          duplicates: values.duplicates,
          reorderings: values.reorderings,
          latencyMs: values.latencyMs,
          jitterMs: values.jitterMs,
          nonceBoundary: values.nonceBoundary,
        }
      }
    }, {
      onSuccess: (run) => {
        setLocation(`/runs/${run.id}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-destructive/30 pb-4">
        <div className="flex items-center gap-3">
          <Zap className="h-8 w-8 text-accent-foreground" />
          <h1 className="text-3xl font-black tracking-tight font-sans uppercase">Bounded Chaos Lab</h1>
        </div>
        <p className="text-muted-foreground font-mono text-sm max-w-3xl">
          Introduce deliberate mutations, latency and boundary violations to verify protocol resilience. 
          All perturbations are deterministic based on the provided seed.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="rounded-none border-border/50 shadow-none bg-card/50 lg:col-span-1 h-fit">
              <CardHeader className="border-b border-border/50 pb-4">
                <CardTitle className="text-sm uppercase font-bold tracking-wider">Base Parameters</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <FormField
                  control={form.control}
                  name="suiteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Target Suite</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="font-mono rounded-none h-10">
                            <SelectValue placeholder="Select suite" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-none">
                          {suitesLoading ? (
                            <div className="p-2"><Skeleton className="h-8 w-full" /></div>
                          ) : (
                            suitesData?.items.filter(s => s.modes.includes('chaos')).map((suite) => (
                              <SelectItem key={suite.id} value={suite.id} className="font-mono">
                                {suite.title}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="seed"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center">
                        <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Seed</FormLabel>
                      </div>
                      <FormControl>
                        <Input {...field} className="font-mono rounded-none h-10" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-none font-bold uppercase tracking-widest text-sm bg-accent-foreground text-white hover:bg-accent-foreground/90" 
                  disabled={createRun.isPending}
                >
                  {createRun.isPending ? (
                    <span className="flex items-center gap-2 animate-pulse">
                      <Zap className="h-4 w-4" /> Injecting Chaos...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" /> Launch Chaos Run
                    </span>
                  )}
                </Button>
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-6">
              <Card className="rounded-none border-accent-foreground/30 shadow-none bg-accent/5">
                <CardHeader className="border-b border-accent-foreground/20 pb-4 bg-accent/10">
                  <CardTitle className="text-sm uppercase font-bold tracking-wider flex items-center gap-2 text-accent-foreground">
                    <AlertTriangle className="h-4 w-4" />
                    Payload Mutations
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="unicodeInsertions"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="font-mono text-xs uppercase tracking-widest text-foreground">Unicode Traps</FormLabel>
                          <span className="font-mono text-xs font-bold text-accent-foreground">{field.value} MAX</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={8}
                            step={1}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormDescription className="font-mono text-[10px]">
                          Inject unassigned or malicious codepoints into string fields.
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="truncations"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="font-mono text-xs uppercase tracking-widest text-foreground">Byte Truncations</FormLabel>
                          <span className="font-mono text-xs font-bold text-accent-foreground">{field.value} MAX</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={4}
                            step={1}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormDescription className="font-mono text-[10px]">
                          Early termination of serialized payloads.
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="duplicates"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="font-mono text-xs uppercase tracking-widest text-foreground">Key Duplication</FormLabel>
                          <span className="font-mono text-xs font-bold text-accent-foreground">{field.value} MAX</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={4}
                            step={1}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormDescription className="font-mono text-[10px]">
                          Duplicate object keys to test last-key-wins parsing behavior.
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="reorderings"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="font-mono text-xs uppercase tracking-widest text-foreground">Field Reordering</FormLabel>
                          <span className="font-mono text-xs font-bold text-accent-foreground">{field.value} MAX</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={4}
                            step={1}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                        <FormDescription className="font-mono text-[10px]">
                          Shuffle JSON properties before hashing.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="rounded-none border-border/50 shadow-none bg-card/50">
                <CardHeader className="border-b border-border/50 pb-4">
                  <CardTitle className="text-sm uppercase font-bold tracking-wider text-muted-foreground">Temporal & State Faults</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <FormField
                    control={form.control}
                    name="latencyMs"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="font-mono text-xs uppercase tracking-widest text-foreground">Base Latency (ms)</FormLabel>
                          <span className="font-mono text-xs font-bold">{field.value}ms</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={250}
                            step={5}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="jitterMs"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="font-mono text-xs uppercase tracking-widest text-foreground">Jitter (ms)</FormLabel>
                          <span className="font-mono text-xs font-bold">{field.value}ms</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={250}
                            step={5}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nonceBoundary"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-none border border-border p-4 col-span-1 md:col-span-2">
                        <div className="space-y-0.5">
                          <FormLabel className="font-mono text-xs uppercase tracking-widest">Nonce Boundary Violations</FormLabel>
                          <FormDescription className="font-mono text-[10px]">
                            Attempt to reuse nonces or advance the nonce sequence out of order.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
