import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Short, absolute lifetime for the expiry experiment. Not a production policy.
export const lifetimeSeconds = 120;
const allowedEmail = () => process.env.AUTH_ALLOWED_EMAIL?.trim().toLowerCase();
export const configured = () => Boolean(
  process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID &&
  process.env.AUTH_GOOGLE_SECRET && allowedEmail() && process.env.AUTH_URL
);

export const { handlers, auth } = NextAuth({
  providers: [Google({ authorization: { params: { scope: "openid email profile", prompt: "select_account" } }, checks: ["pkce", "state"] })],
  session: { strategy: "jwt", maxAge: lifetimeSeconds },
  // Never log provider profiles, codes, tokens or error causes.
  logger: { error() { console.error("auth_failure"); }, warn() { console.warn("auth_warning"); }, debug() {} },
  callbacks: {
    signIn({ account, profile }) {
      return Boolean(configured() && account?.provider === "google" &&
        profile?.email_verified === true && profile?.email?.toLowerCase() === allowedEmail() &&
        typeof profile?.sub === "string" && profile.sub.length);
    },
    jwt({ token, account, profile }) {
      if (account) {
        // Persist only the stable provider identity and authorization claims.
        return {
          sub: `google:${profile?.sub}`,
          email: profile?.email?.toLowerCase(),
          deadline: Math.floor(Date.now() / 1000) + lifetimeSeconds,
        };
      }
      if (!configured() || token.email !== allowedEmail() ||
          typeof token.sub !== "string" || !token.sub.startsWith("google:") ||
          typeof token.deadline !== "number" || Date.now() >= token.deadline * 1000) return null;
      return token;
    },
    session({ session, token }) {
      return { expires: new Date(Number(token.deadline) * 1000).toISOString(), user: { id: token.sub! } };
    },
  },
});
