import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, "Password is required")
      .min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SetPasswordFormValues = z.infer<typeof setPasswordSchema>;

export const inviteUserSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  fullName: z
    .string()
    .min(1, "Full name is required")
    .max(120, "Full name is too long"),
});

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

export const setPasswordWithProfileSchema = setPasswordSchema
  .extend({
    fullName: z
      .string()
      .min(1, "Full name is required")
      .max(120, "Full name is too long"),
  });

export type SetPasswordWithProfileFormValues = z.infer<
  typeof setPasswordWithProfileSchema
>;
