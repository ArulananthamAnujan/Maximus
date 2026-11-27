// Entry point; the work is in handler.ts (kept separate so it can be tested).
import { handler } from "./handler.ts";

Deno.serve(handler);
