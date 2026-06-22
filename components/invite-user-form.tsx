"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import {
  inviteUserSchema,
  type InviteUserFormValues,
} from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InviteUserForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      fullName: "",
    },
  });

  async function onSubmit(values: InviteUserFormValues) {
    setSubmitError(null);
    setSuccessMessage(null);

    const response = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const result = (await response.json()) as { error?: string; success?: boolean };

    if (!response.ok) {
      setSubmitError(result.error ?? "Could not send invitation");
      return;
    }

    setSuccessMessage(`Invitation sent to ${values.email}`);
    reset();
  }

  return (
    <Card className="w-full max-w-md border shadow-lg">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserPlus className="size-5" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold tracking-tight">
              Invite user
            </CardTitle>
            <CardDescription>
              Supabase will email a link to set their password.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jane Smith"
              autoComplete="name"
              className="h-10"
              aria-invalid={!!errors.fullName}
              {...register("fullName")}
            />
            {errors.fullName && (
              <p className="text-sm text-destructive">{errors.fullName.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@avatarnaturalfoods.com"
              autoComplete="email"
              className="h-10"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {successMessage && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-800 dark:text-green-300"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <Button
            type="submit"
            variant="default"
            size="lg"
            className="h-10 w-full font-semibold shadow-sm"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending invitation…
              </>
            ) : (
              "Send invitation"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
