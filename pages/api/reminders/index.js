import connectToDatabase from "../../../lib/mongodb";
import Reminder from "../../../models/reminder";

function toDateTimeParts(ringtime) {
  const when = new Date(ringtime);
  const iso = when.toISOString();
  return {
    ringtime: when,
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
  };
}

export default async function handler(req, res) {
  await connectToDatabase();

  if (req.method === "GET") {
    const reminders = await Reminder.find().sort({ date: -1, time: -1 }).lean();
    return res.status(200).json(reminders);
  }

  if (req.method === "POST") {
    const {
      title,
      description = "",
      ringtime,
      onRepeat,
      intervalSeconds,
      snoozeSeconds,
      earlyReminderSeconds,
    } = req.body;

    if (!title || !ringtime) {
      return res.status(400).json({ error: "title and ringtime are required" });
    }

    const parsedOnRepeat = String(onRepeat) === "true" || onRepeat === true;
    const interval = Number(intervalSeconds) || 0;
    const snooze = Number(snoozeSeconds) || 0;
    const earlyReminder = Number(earlyReminderSeconds) || 0;
    const dt = toDateTimeParts(ringtime);

    const reminder = await Reminder.create({
      title,
      description,
      ...dt,
      status: "Pending",
      onRepeat: parsedOnRepeat,
      intervalSeconds: parsedOnRepeat ? interval : 0,
      snoozeSeconds: snooze,
      earlyReminderSeconds: earlyReminder,
    });

    return res.status(201).json(reminder);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
