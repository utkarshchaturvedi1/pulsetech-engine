import { randomBytes } from "crypto";
import { TEXAS_SOLAR_TEST_DEMO_ID } from "../data/testBusinessProfiles";
import { BusinessProfile } from "../types/business";
import { sanitizeDemoId } from "./demoRepository";
import { demoIdFromWebsite } from "./demoStore";
import {
  commitSharedProfile,
  isDurableProfileStoreConfigured,
  isEphemeralRuntime,
  type SharedProfileCommitResult,
} from "./sharedProfileStore";

export const SETUP_SAVE_FAILED_MESSAGE =
  "We analyzed the website but could not save your demo. Please try again from the homepage.";

export function createPersonalizedDemoId(website: string): string {
  const base = sanitizeDemoId(demoIdFromWebsite(website)) || "demo";
  const suffix = randomBytes(4).toString("hex");
  const prefix =
    base === TEXAS_SOLAR_TEST_DEMO_ID ? "site-" + base : base;
  const id = sanitizeDemoId(prefix + "-" + suffix);
  if (!id || id === TEXAS_SOLAR_TEST_DEMO_ID) {
    return "demo-" + suffix;
  }
  return id;
}

export function isInvitationSaveReady(
  commit: SharedProfileCommitResult
): boolean {
  if (!commit.persisted || !commit.demo.id || !commit.demo.profile.businessName) {
    return false;
  }
  if (commit.demo.id === TEXAS_SOLAR_TEST_DEMO_ID) {
    return false;
  }
  if (isDurableProfileStoreConfigured()) {
    return commit.durable && commit.backend === "supabase";
  }
  if (isEphemeralRuntime()) {
    return false;
  }
  return true;
}

export async function saveNewPersonalizedDemo(
  profile: BusinessProfile
): Promise<SharedProfileCommitResult> {
  const businessName = profile.businessName?.trim() || "";
  if (!businessName) {
    throw new Error("Website analysis did not produce a business name.");
  }

  const id = createPersonalizedDemoId(profile.website);
  if (id === TEXAS_SOLAR_TEST_DEMO_ID) {
    throw new Error("Generated demo id collided with the public sample.");
  }

  return commitSharedProfile(id, {
    ...profile,
    businessName,
    isTestData: false,
  });
}

export function invitationPathForDemoId(id: string): string {
  return "/demo/" + encodeURIComponent(id);
}
