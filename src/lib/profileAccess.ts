export type ProfileAccess = { allowed: true } | { allowed: false; status: 401 | 403 | 503; error: string };

export type ProfileAccessDependencies = {
  findAccount: (demoId: string) => Promise<string | null>;
  currentUser: () => Promise<{ id: string; admin: boolean } | null>;
  belongsToAccount: (userId: string, accountId: string) => Promise<boolean>;
};

/** Public, unclaimed demos remain testable. Account-linked profiles require ownership. */
export async function checkProfileAccess(demoId: string, deps: ProfileAccessDependencies): Promise<ProfileAccess> {
  try {
    const accountId = await deps.findAccount(demoId);
    if (!accountId) return { allowed: true };
    const user = await deps.currentUser();
    if (!user) return { allowed: false, status: 401, error: "Please sign in to access this business profile." };
    if (user.admin || await deps.belongsToAccount(user.id, accountId)) return { allowed: true };
    return { allowed: false, status: 403, error: "This business profile belongs to another customer account." };
  } catch {
    // A missing migration or database outage cannot turn a tenant profile into a public demo.
    return { allowed: false, status: 503, error: "Business profile access is temporarily unavailable." };
  }
}
