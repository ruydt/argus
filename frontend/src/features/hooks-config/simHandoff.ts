// One-shot sessionStorage handoff for "Simulate this event": a raw event payload
// is stashed here, then the Hooks page reads + clears it when it opens the
// simulator via ?view=simulator&event=…&payload=1. Kept tiny and shared so the
// producer (events feature) and consumer (hooks-config) agree on the key.
export const SIM_PAYLOAD_HANDOFF_KEY = 'argus:sim-payload'
