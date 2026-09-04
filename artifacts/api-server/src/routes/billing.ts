import { Router, type IRouter } from "express";
import { ApplyUpgradeKeyBody, GetMyBillingResponse, ApplyUpgradeKeyResponse } from "@workspace/api-zod";
import { getAuthenticatedUser, restService } from "../lib/supabase";
import { getBilling, type PackageKey } from "../lib/credits";
import { claimUpgradeKey } from "../lib/activation-keys";

const router: IRouter = Router();

router.get("/billing/me", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { package: pkg, credits } = await getBilling(user.id);
    res.json(
      GetMyBillingResponse.parse({
        package: pkg.key,
        credits: pkg.startCredits === null ? null : credits,
        canCreateSubjects: pkg.canCreateSubjects,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not load billing summary");
    res.status(500).json({ error: "Pakketinformatie kon niet worden geladen." });
  }
});

router.post("/activation/upgrade", async (req, res): Promise<void> => {
  const user = await getAuthenticatedUser(req.header("authorization"));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const input = ApplyUpgradeKeyBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Ongeldige code." });
    return;
  }

  try {
    const current = await restService<Record<string, unknown>[]>(
      `account_billing?user_id=eq.${user.id}&select=package`,
    );
    const currentPackage = (current[0]?.package as PackageKey) ?? "trial";
    const claimed = await claimUpgradeKey(input.data.code.trim().toUpperCase(), currentPackage);
    if (!claimed) {
      res.status(400).json({
        error: "Deze code is ongeldig, al gebruikt, of geen upgrade t.o.v. je huidige pakket.",
      });
      return;
    }

    const pkgRows = await restService<Record<string, unknown>[]>(
      `packages?key=eq.${claimed.package}&select=*`,
    );
    const startCredits = (pkgRows[0]?.start_credits as number | null) ?? 0;

    await restService(`account_billing?user_id=eq.${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ package: claimed.package, credits: startCredits }),
    });
    await restService("credit_transactions", {
      method: "POST",
      body: JSON.stringify({
        account_id: user.id,
        delta: startCredits,
        reason: "package_upgrade",
        note: `Upgrade naar ${claimed.package} via key`,
      }),
    });

    const { package: pkg, credits } = await getBilling(user.id);
    res.json(
      ApplyUpgradeKeyResponse.parse({
        package: pkg.key,
        credits: pkg.startCredits === null ? null : credits,
        canCreateSubjects: pkg.canCreateSubjects,
      }),
    );
  } catch (error) {
    req.log.warn({ error }, "Could not apply upgrade key");
    res.status(500).json({ error: "Upgrade is mislukt." });
  }
});

export default router;
