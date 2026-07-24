import { z } from "zod";

export const movingTransferAmountSchema = z.object({
  amount: z
    .number({ error: "Enter an amount" })
    .positive("Amount must be greater than zero"),
});

export const movingTransferSchema = z.object({
  movingId: z.uuid(),
  storageType: z.literal("black_container"),
  amount: z
    .number({ error: "Enter an amount" })
    .positive("Amount must be greater than zero"),
});

export type MovingTransferValues = z.infer<typeof movingTransferSchema>;