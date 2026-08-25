import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ShieldCheck, CheckCircle, XCircle, Code2, AlertTriangle, Fingerprint } from "lucide-react";

import { useVerifyMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  did: z.string().min(1, "DID is required"),
  room: z.string().min(1, "Room is required"),
  nonce: z.string().min(1, "Nonce is required"),
  text: z.string().min(1, "Text is required"),
  signature: z.string().min(1, "Signature is required"),
});

export function Verify() {
  const verifyMessage = useVerifyMessage();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      did: "",
      room: "",
      nonce: "",
      text: "",
      signature: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    verifyMessage.mutate({
      data: values
    });
  }

  const result = verifyMessage.data;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-2 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Fingerprint className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-black tracking-tight font-sans uppercase">Signature Inspector</h1>
        </div>
        <p className="text-muted-foreground font-mono text-sm max-w-3xl">
          Manual diagnostic tool for protocol message verification. Evaluates canonicalization, signature schemes, and validation rules.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-none border-border/50 shadow-none bg-card/50 h-fit">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-sm uppercase font-bold tracking-wider">Raw Message Input</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="did"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Author DID</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono text-xs rounded-none h-10" placeholder="did:key:..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="room"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Room ID</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono text-xs rounded-none h-10" placeholder="room_..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nonce"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Nonce</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono text-xs rounded-none h-10" placeholder="00000000..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="text"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Message Text</FormLabel>
                      <FormControl>
                        <Textarea {...field} className="font-mono text-xs rounded-none min-h-[120px] resize-none" placeholder="Enter message payload..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="signature"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Ed25519 Signature (Hex)</FormLabel>
                      <FormControl>
                        <Textarea {...field} className="font-mono text-[10px] rounded-none min-h-[80px] resize-none break-all" placeholder="Signature hex..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-none font-bold uppercase tracking-widest text-xs mt-4" 
                  disabled={verifyMessage.isPending}
                >
                  {verifyMessage.isPending ? (
                    <span className="flex items-center gap-2 animate-pulse">
                      <ShieldCheck className="h-4 w-4" /> Inspecting...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Code2 className="h-4 w-4" /> Run Verification
                    </span>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-6 flex flex-col h-full">
          {result ? (
            <>
              <Card className={`rounded-none border-t-4 shadow-none ${result.valid ? 'border-t-primary' : 'border-t-destructive'}`}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    {result.valid ? (
                      <CheckCircle className="h-10 w-10 text-primary flex-shrink-0" />
                    ) : (
                      <XCircle className="h-10 w-10 text-destructive flex-shrink-0" />
                    )}
                    <div>
                      <h2 className="text-xl font-black tracking-tight font-sans uppercase">
                        {result.valid ? 'Signature Valid' : 'Verification Failed'}
                      </h2>
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        Cryptographic assertion completed.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {result.diagnostics.length > 0 && (
                <Card className="rounded-none border-destructive/30 shadow-none bg-destructive/5">
                  <CardHeader className="border-b border-destructive/20 py-3 bg-destructive/10">
                    <CardTitle className="text-xs uppercase font-bold tracking-wider flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Diagnostics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-destructive/20 font-mono text-[11px] text-destructive">
                      {result.diagnostics.map((diag, i) => (
                        <li key={i} className="px-4 py-3">{diag}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-none border-border/50 shadow-none bg-card/50 flex-1 flex flex-col min-h-0">
                <CardHeader className="border-b border-border/50 py-3 bg-muted/30">
                  <CardTitle className="text-xs uppercase font-bold tracking-wider text-muted-foreground">Canonical Output</CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
                  <div className="p-4 bg-muted/20 border-b border-border/50">
                    <span className="text-[9px] font-mono text-muted-foreground uppercase block mb-1">Swept Text (Normalization)</span>
                    <pre className="text-[11px] font-mono p-3 bg-black/90 text-primary-foreground overflow-auto">
                      {result.sweptText}
                    </pre>
                  </div>
                  <div className="p-4 bg-muted/20 border-b border-border/50">
                    <span className="text-[9px] font-mono text-muted-foreground uppercase block mb-1">Reconstructed Canonical JSON</span>
                    <pre className="text-[11px] font-mono p-3 bg-black/90 text-primary-foreground overflow-auto">
                      {result.canonicalPayload}
                    </pre>
                  </div>
                  <div className="p-4 bg-muted/20 flex-1">
                    <span className="text-[9px] font-mono text-muted-foreground uppercase block mb-1">Payload UTF-8 Hex (Hashing Target)</span>
                    <pre className="text-[10px] font-mono p-3 bg-black text-muted-foreground overflow-auto break-all h-full max-h-48">
                      {result.payloadUtf8Hex}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="rounded-none border border-dashed border-border/50 shadow-none bg-transparent flex-1 flex items-center justify-center min-h-[400px]">
              <div className="text-center opacity-30">
                <ShieldCheck className="h-12 w-12 mx-auto mb-4" />
                <h3 className="font-mono font-bold text-sm uppercase tracking-widest">Awaiting Payload</h3>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
