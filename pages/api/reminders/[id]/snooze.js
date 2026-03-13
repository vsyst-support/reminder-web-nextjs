import connectToDatabase from "../../../../lib/mongodb";
import Reminder from "../../../../models/reminder";

export default async function handler(req, res) {
  await connectToDatabase();
  const { id } = req.query;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { snoozeUntil } = req.body;
  if (!snoozeUntil) {
    return res.status(400).json({ error: "snoozeUntil is required" });
  }

  const when = new Date(snoozeUntil);
  const iso = when.toISOString();

  await Reminder.findByIdAndUpdate(id, {
    ringtime: when,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    notified: false,
  });

  return res.status(200).json({ ok: true });
}
