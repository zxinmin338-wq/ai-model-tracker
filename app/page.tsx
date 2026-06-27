import { WelcomeGate } from "@/components/welcome-gate";

// The homepage shell renders instantly — no server-side Supabase query — so a
// cold DB can never make a visitor wait on a blank page or see a "0 models"
// board. WelcomeGate shows a welcome screen, fetches the data client-side from
// /api/home-data (warmed in the background on landing), and reveals the
// dashboard once data is ready.
export default function HomePage() {
  return <WelcomeGate />;
}
