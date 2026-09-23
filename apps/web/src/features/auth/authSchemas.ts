import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(254, "Email addresses must be 254 characters or fewer.")
  .email("Enter a valid email address.");

const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(256, "Passwords must be 256 characters or fewer.");

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Names must be 80 characters or fewer."),
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignUpValues = z.infer<typeof signUpSchema>;
export type SignInValues = z.infer<typeof signInSchema>;
