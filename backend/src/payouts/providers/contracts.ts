import { z } from "zod";

export const payoutsIntegrationPayloadSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("africas_talking"),
    sandbox: z.boolean(),
    africasTalking: z.object({
      username: z.string().min(1),
      apiKey: z.string().min(1)
    }),
    defaults: z.object({ currency: z.enum(["NGN"]), channel: z.enum(["airtime"]) })
  }),
  z.object({
    provider: z.literal("termii"),
    sandbox: z.boolean(),
    termii: z.object({
      apiKey: z.string().min(1),
      senderId: z.string().optional()
    }),
    defaults: z.object({ currency: z.enum(["NGN"]), channel: z.enum(["airtime"]) })
  }),
  z.object({
    provider: z.literal("reloadly"),
    sandbox: z.boolean(),
    reloadly: z.object({
      clientId: z.string().min(1),
      clientSecret: z.string().min(1)
    }),
    defaults: z.object({ currency: z.enum(["NGN"]), channel: z.enum(["airtime"]) })
  })
]);

export type PayoutsIntegrationPayload = z.infer<typeof payoutsIntegrationPayloadSchema>;

export type ConnectionResult =
  | { status: "healthy"; latencyMs: number; message: string }
  | { status: "degraded"; latencyMs: number; message: string }
  | { status: "failed"; message: string };

export type DispatchResult =
  | { ok: true; providerTxnId: string; issuedAt: Date }
  | { ok: false; reason: string; retryable: boolean };

// Minimal projection of the Reward row the adapters need.
export type RewardDispatchInput = {
  id: string;
  amount: number;
  channel: string;
  learnerPhone: string;
  retryCount: number;
};

export interface PayoutProvider {
  readonly key: "africas_talking" | "termii" | "reloadly";
  verifyCredentials(config: PayoutsIntegrationPayload): Promise<ConnectionResult>;
  dispatch(reward: RewardDispatchInput, config: PayoutsIntegrationPayload): Promise<DispatchResult>;
}
