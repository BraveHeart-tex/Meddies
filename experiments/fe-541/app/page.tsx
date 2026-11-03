import { configured } from "../auth";

export const dynamic = "force-dynamic";

export default function Page() {
  return <main>
    <h1>FE-541 Google authentication experiment</h1>
    <p>Synthetic data only. Sessions expire two minutes after sign-in.</p>
    <p>{configured() ? "Google configuration present. Live verification still required." : "Google configuration missing. Sign-in is unavailable."}</p>
    <p><a href="/api/auth/signin">Sign in with Google</a></p>
    <p><a href="/api/private">Check private session</a></p>
    <p><a href="/api/auth/signout">Sign out</a></p>
  </main>;
}
