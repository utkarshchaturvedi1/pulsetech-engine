export async function fetchWebsite(
  website: string
): Promise<string> {
  let response: Response;

  try {
    response = await fetch(website, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 PulseTechLabs Website Analyzer",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Timed out while downloading the website.");
    }

    throw new Error("Unable to download website.");
  }

  if (!response.ok) {
    throw new Error("Unable to download website.");
  }

  return await response.text();
}
