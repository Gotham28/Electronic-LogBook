const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error("Missing required environment variable: JWT_SECRET");
}
export const JWT_SECRET: string = secret;
export const SUPPORT_ADMIN_EMAIL: string | undefined = process.env.SUPPORT_ADMIN_EMAIL?.trim() || undefined;
export const FRONTEND_URL: string = process.env.FRONTEND_URL?.trim() || "http://localhost:5173";
