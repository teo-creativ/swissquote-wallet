// Plain health page. This service has no UI: every feature is an API route (CDC annex A.3).
export default function Page() {
  return (
    <main>
      <h1>sq-keys-mock</h1>
      <p>Simulated Swissquote service for the SQ Keys prototype. Testnet only (Base Sepolia). Nothing here is a real Swissquote system.</p>
      <p>Health: <a href="/api/health">/api/health</a></p>
    </main>
  );
}
