import { z } from "zod";

// Zod probes `Function("")` to JIT-compile object schemas; the CSP forbids eval, so use its interpreted path in the browser.
z.config({ jitless: true });
