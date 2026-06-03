/**
 * Post-deploy end-to-end smoke for the payouts dispatch pipeline.
 *
 * Seeds a Pending Reward via Prisma, then polls every 10 seconds for up
 * to 6 minutes waiting for the row to flip to Issued. The staging
 * scheduler hits /internal/payouts/dispatch every 5 minutes against a
 * sandbox provider, so we expect the row to move to Issued within one
 * scheduler tick.
 *
 * Exits 0 on success, 1 on timeout or unexpected error.
 */
import { prisma } from "../admin/prisma.js";

async function main() {
  const phone = `+234${Date.now()}`.slice(0, 14);
  const moduleName = `Smoke ${new Date().toISOString()}`;
  const user = await prisma.user.create({ data: { phone } });
  const reward = await prisma.reward.create({
    data: {
      userId: user.id,
      module: moduleName,
      amount: 100,
      channel: "airtime",
      learnerPhone: phone,
      status: "Pending"
    }
  });
  console.log(JSON.stringify({
    event: "payouts.smoke.seeded",
    rewardId: reward.id,
    phone,
    module: moduleName
  }));

  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    const current = await prisma.reward.findUnique({ where: { id: reward.id } });
    if (!current) {
      console.error(JSON.stringify({ event: "payouts.smoke.disappeared", rewardId: reward.id }));
      process.exit(1);
    }
    if (current.status === "Issued") {
      console.log(JSON.stringify({
        event: "payouts.smoke.ok",
        rewardId: reward.id,
        providerTxnId: current.providerTxnId,
        issuedAt: current.issuedAt
      }));
      process.exit(0);
    }
    if (current.status === "Failed") {
      console.error(JSON.stringify({
        event: "payouts.smoke.failed",
        rewardId: reward.id,
        failureReason: current.failureReason
      }));
      process.exit(1);
    }
  }
  console.error(JSON.stringify({
    event: "payouts.smoke.timeout",
    rewardId: reward.id,
    phone
  }));
  process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({
    event: "payouts.smoke.error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  }));
  process.exit(1);
});
