import { schedule } from "@netlify/functions";
import {
  getUsersStore,
  INACTIVE_DAYS,
  runInactiveUserCleanup,
} from "../lib/user-auth.js";

const handler = schedule("@daily", async (event) => {
  try {
    const store = getUsersStore(event);
    const result = await runInactiveUserCleanup(store);
    console.log(
      `[cleanup] cutoff=${INACTIVE_DAYS}d removed=${result.removed.length} remaining=${result.remaining}`,
    );
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    console.error("[cleanup] failed:", error);
    return { statusCode: 500, body: JSON.stringify({ error: String(error) }) };
  }
});

export { handler };
