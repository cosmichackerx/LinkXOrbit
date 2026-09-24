import { app, session } from "electron";

export const LINKEDIN_PARTITION = "persist:linkedin";

export function getLinkedInSession(): Electron.Session {
  return session.fromPartition(LINKEDIN_PARTITION);
}

export async function hasLinkedInSession(): Promise<boolean> {
  const cookies = await getLinkedInSession().cookies.get({ domain: ".linkedin.com" });
  const liAt = cookies.find((c) => c.name === "li_at");
  return Boolean(liAt?.value);
}

export function linkedInUserDataPath(): string {
  return app.getPath("userData");
}
