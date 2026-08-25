import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Play, Dna, Settings2, Zap, Cpu } from "lucide-react";

import {
  useListSuites,
  useListImplementations,
  useCreateRun,
  RunInputImplementationIdsItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "object" && error !== null) {
    const data = "data" in error ? error.data : undefined;
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
    ) {
      return data.error;
    }
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return "The comparison could not be started.";
}

const formSchema = z.object({
  suiteId: z.string().min(1, "Suite is required"),
  seed: z.string().min(1, "Seed is required"),
  implementationIds: z
    .array(z.string())
    .min(1, "Select at least one implementation")
    .max(3, "Select up to 3 implementations"),
});

function generateRandomSeed() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function Workbench() {
  const [, setLocation] = useLocation();
  const { data: suitesData, isLoading: suitesLoading } = useListSuites();
  const { data: implsData, isLoading: implsLoading } = useListImplementations();
  const createRun = useCreateRun();

  const builtInImpls =
    implsData?.items.filter((i) => i.status === "built-in" || !i.status) || [];

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      suiteId: "",
      seed: generateRandomSeed(),
      implementationIds: [],
    },
  });

  // Preselect built-ins if they load after form init
  useEffect(() => {
    if (
      builtInImpls.length > 0 &&
      form.getValues().implementationIds.length === 0
    ) {
      form.setValue(
        "implementationIds",
        builtInImpls.slice(0, 3).map((i) => i.id),
      );
    }
  }, [builtInImpls.length, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    createRun.mutate(
      {
        data: {
          suiteId: values.suiteId,
          seed: values.seed,
          mode: "standard",
          implementationIds:
            values.implementationIds as RunInputImplementationIdsItem[],
        },
      },
      {
        onSuccess: (run) => {
          setLocation(`/runs/${run.id}`);
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <h1 className="text-3xl font-black tracking-tight font-sans uppercase">
          Conformance Workbench
        </h1>
        <p className="text-muted-foreground font-mono text-sm max-w-3xl">
          Execute deterministic qualification suites against 1–3 local
          Technocore implementations simultaneously. Standard mode asserts exact
          wire rules and highlights protocol divergences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="rounded-none border-border/50 shadow-none bg-card/50">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="flex items-center gap-2 text-lg uppercase font-bold tracking-wider">
              <Settings2 className="h-5 w-5 text-primary" />
              Execution Parameters
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              Configure suite, targets, and entropy source
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="suiteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Target Suite
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="font-mono rounded-none h-12">
                            <SelectValue placeholder="Select qualification suite" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-none">
                          {suitesLoading ? (
                            <div className="p-2">
                              <Skeleton className="h-8 w-full" />
                            </div>
                          ) : (
                            suitesData?.items.map((suite) => (
                              <SelectItem
                                key={suite.id}
                                value={suite.id}
                                className="font-mono"
                              >
                                {suite.title}{" "}
                                <span className="text-muted-foreground ml-2">
                                  v{suite.version}
                                </span>
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
                  name="implementationIds"
                  render={() => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                        Target Implementations (Max 3)
                      </FormLabel>
                      <div className="space-y-3 mt-2">
                        {implsLoading ? (
                          <Skeleton className="h-24 w-full rounded-none" />
                        ) : (
                          builtInImpls.map((impl) => (
                            <FormField
                              key={impl.id}
                              control={form.control}
                              name="implementationIds"
                              render={({ field }) => {
                                return (
                                  <FormItem
                                    key={impl.id}
                                    className="flex flex-row items-start space-x-3 space-y-0 rounded-none border border-border/50 p-4 bg-muted/10 hover:border-primary/50 transition-colors"
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(impl.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([
                                                ...field.value,
                                                impl.id,
                                              ])
                                            : field.onChange(
                                                field.value?.filter(
                                                  (value) => value !== impl.id,
                                                ),
                                              );
                                        }}
                                        disabled={
                                          !field.value?.includes(impl.id) &&
                                          field.value?.length >= 3
                                        }
                                        className="rounded-none mt-0.5"
                                      />
                                    </FormControl>
                                    <div className="space-y-1 font-mono">
                                      <FormLabel className="text-sm font-bold cursor-pointer">
                                        {impl.name}
                                      </FormLabel>
                                      <FormDescription className="text-[10px] text-muted-foreground">
                                        {impl.language} |{" "}
                                        {impl.kind || "reference"} | v
                                        {impl.version}
                                      </FormDescription>
                                    </div>
                                  </FormItem>
                                );
                              }}
                            />
                          ))
                        )}
                      </div>
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
                        <FormLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                          Deterministic Seed
                        </FormLabel>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] font-mono rounded-none px-2 text-primary"
                          onClick={() =>
                            form.setValue("seed", generateRandomSeed())
                          }
                        >
                          <Dna className="h-3 w-3 mr-1" />
                          Regenerate
                        </Button>
                      </div>
                      <FormControl>
                        <Input
                          {...field}
                          className="font-mono rounded-none h-12"
                          placeholder="Hex encoded entropy"
                        />
                      </FormControl>
                      <FormDescription className="font-mono text-[10px]">
                        Seed ensures exact recreation of temporal and random
                        boundary cases.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-14 rounded-none font-bold uppercase tracking-widest text-sm"
                  disabled={createRun.isPending}
                >
                  {createRun.isPending ? (
                    <span className="flex items-center gap-2 animate-pulse">
                      <Zap className="h-4 w-4" /> Executing Suite...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Play className="h-4 w-4" /> Launch Standard Run
                    </span>
                  )}
                </Button>
                {createRun.isError && (
                  <div
                    role="alert"
                    className="border-l-2 border-destructive bg-destructive/10 p-3 font-mono text-xs text-destructive"
                  >
                    {errorMessage(createRun.error)}
                  </div>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-none border-primary/20 bg-primary/5 shadow-none">
            <CardHeader>
              <CardTitle className="text-sm font-mono uppercase tracking-widest text-primary flex items-center gap-2">
                <Cpu className="h-4 w-4" /> System Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Execution Class</span>
                  <span className="text-primary font-bold">PURE_LOCAL</span>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Fuzzing Engine</span>
                  <span className="font-bold text-accent-foreground">
                    STANDBY
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Multi-Runner</span>
                  <span className="font-bold">ACTIVE</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
