"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  setPasswordWithProfileSchema,
  type SetPasswordWithProfileFormValues,
} from "@/lib/validations/auth";
import { POST_LOGIN_PATH } from "@/lib/auth/redirect";
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

export function SetPasswordForm() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordWithProfileFormValues>({
    resolver: zodResolver(setPasswordWithProfileSchema),
    defaultValues: {
      fullName: "",
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      setSessionReady(true);
      if (session?.user.user_metadata?.full_name) {
        reset({
          fullName: String(session.user.user_metadata.full_name),
          password: "",
          confirmPassword: "",
        });
      }
    });
  }, [reset]);

  async function onSubmit(values: SetPasswordWithProfileFormValues) {
    setAuthError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setAuthError(
        "Your session has expired. Use the link from your invitation email, or sign in first."
      );
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: values.password,
      data: { full_name: values.fullName },
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    await supabase
      .from("profiles")
      .update({ full_name: values.fullName })
      .eq("id", session.user.id);

    router.push(POST_LOGIN_PATH);
    router.refresh();
  }

  if (!sessionReady) {
    return (
      <Card className="w-full max-w-md border shadow-lg">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold tracking-tight">
          Set your password
        </CardTitle>
        <CardDescription>
          Complete your account by setting your name and password.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-2">
        {!hasSession && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              You need an active session to set a password.{" "}
              <Link
                href="/login?next=/set-password"
                className="font-medium underline underline-offset-4"
              >
                Sign in
              </Link>{" "}
              or open the link from your invitation email.
            </span>
          </div>
        )}

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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="new-password"
              className="h-10"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              autoComplete="new-password"
              className="h-10"
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {authError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <Button
            type="submit"
            variant="default"
            size="lg"
            className="h-10 w-full font-semibold shadow-sm"
            disabled={isSubmitting || !hasSession}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save password"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
