/**
 * Daily digest Worker: emails open reminders that are due (or coming up)
 * and companies with earnings in the next 7 days, so tactical trades are
 * never forgotten. Sends via Resend (https://resend.com — free tier is
 * plenty for one email a day). If RESEND_API_KEY isn't set, it logs and
 * exits; the in-app "Up next" list still shows everything.
 */
export interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  DIGEST_TO: string;
  DIGEST_FROM: string;
}

interface ReminderRow {
  id: number;
  body: string;
  due_date: string | null;
  company_name: string | null;
  company_ticker: string | null;
}

interface EarningsRow {
  name: string;
  ticker: string | null;
  next_earnings_date: string;
  horizon: string | null;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const soon = addDays(today, 3);
    const earningsHorizon = addDays(today, 7);

    const reminders = await env.DB.prepare(
      `SELECT r.id, r.body, r.due_date, c.name AS company_name, c.ticker AS company_ticker
       FROM reminders r LEFT JOIN companies c ON c.id = r.company_id
       WHERE r.done = 0 AND r.due_date IS NOT NULL AND r.due_date <= ?
       ORDER BY r.due_date`,
    )
      .bind(soon)
      .all<ReminderRow>();

    const earnings = await env.DB.prepare(
      `SELECT name, ticker, next_earnings_date, horizon FROM companies
       WHERE next_earnings_date IS NOT NULL
         AND next_earnings_date >= ? AND next_earnings_date <= ?
         AND status IN ('quick_look','worked','watchlist','owned')
       ORDER BY next_earnings_date`,
    )
      .bind(today, earningsHorizon)
      .all<EarningsRow>();

    if (!reminders.results.length && !earnings.results.length) {
      console.log("digest: nothing due — no email sent");
      return;
    }
    if (!env.RESEND_API_KEY) {
      console.log("digest: RESEND_API_KEY not set — skipping email");
      return;
    }

    const lines: string[] = [];
    if (reminders.results.length) {
      lines.push("DUE / UPCOMING REMINDERS", "");
      for (const r of reminders.results) {
        const overdue = r.due_date && r.due_date < today ? " (OVERDUE)" : "";
        const who = r.company_name
          ? ` — ${r.company_name}${r.company_ticker ? ` (${r.company_ticker})` : ""}`
          : "";
        lines.push(`• [${r.due_date}]${overdue} ${r.body}${who}`);
      }
      lines.push("");
    }
    if (earnings.results.length) {
      lines.push("EARNINGS IN THE NEXT 7 DAYS", "");
      for (const e of earnings.results) {
        lines.push(
          `• ${e.next_earnings_date}: ${e.name}${e.ticker ? ` (${e.ticker})` : ""}${e.horizon === "tactical" ? " — tactical idea" : ""}`,
        );
      }
      lines.push("");
    }
    lines.push("— Stones");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.DIGEST_FROM,
        to: [env.DIGEST_TO],
        subject: `Stones: ${reminders.results.length} reminder(s), ${earnings.results.length} earnings ahead`,
        text: lines.join("\n"),
      }),
    });
    if (!res.ok) {
      console.error("digest: Resend error", res.status, await res.text());
    } else {
      console.log("digest: email sent");
    }
  },
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
