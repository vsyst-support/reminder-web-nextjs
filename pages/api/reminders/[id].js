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
  const { id } = req.query;

  if (req.method === "PUT") {
    const {
      title,
      description,
      ringtime,
      status,
      onRepeat,
      intervalSeconds,
      snoozeSeconds,
      earlyReminderSeconds,
      notified,
    } = req.body;

    const existing = await Reminder.findById(id);
    if (!existing) {
      return res.status(404).json({ error: "Reminder not found" });
    }

    const hasOnRepeat = onRepeat !== undefined;
    const parsedOnRepeat = hasOnRepeat
      ? String(onRepeat) === "true" || onRepeat === true
      : existing.onRepeat;
    const interval =
      intervalSeconds !== undefined ? Math.max(0, Number(intervalSeconds) || 0) : existing.intervalSeconds;
    const snooze =
      snoozeSeconds !== undefined ? Math.max(0, Number(snoozeSeconds) || 0) : existing.snoozeSeconds;
    const earlyReminder =
      earlyReminderSeconds !== undefined
        ? Math.max(0, Number(earlyReminderSeconds) || 0)
        : existing.earlyReminderSeconds;

    const patch = {
      title: title ?? existing.title,
      description: description ?? existing.description,
      status: status ?? existing.status,
      onRepeat: parsedOnRepeat,
      intervalSeconds: parsedOnRepeat ? interval : 0,
      snoozeSeconds: snooze,
      earlyReminderSeconds: earlyReminder,
    };

    const ringtimeChanged =
      ringtime !== undefined &&
      ringtime !== null &&
      new Date(ringtime).getTime() !== new Date(existing.ringtime).getTime();
    const nextStatus = patch.status;
    const shouldResetNotified = ringtimeChanged || nextStatus !== "Done";

    if (typeof notified === "boolean") {
      patch.notified = notified;
    } else if (shouldResetNotified) {
      // Re-enable scheduling when reminder is moved or marked active again.
      patch.notified = false;
    }

    if (ringtime) {
      Object.assign(patch, toDateTimeParts(ringtime));
    }

    let updatedReminder = await Reminder.findByIdAndUpdate(id, patch, { new: true });

    if (
      updatedReminder.onRepeat &&
      updatedReminder.status === "Done" &&
      updatedReminder.intervalSeconds > 0
    ) {
      const originalDateTime = new Date(updatedReminder.ringtime);
      const totalDelaySeconds = updatedReminder.intervalSeconds + updatedReminder.snoozeSeconds;
      const baseMs = Math.max(originalDateTime.getTime(), Date.now());
      const nextDateTime = new Date(baseMs + totalDelaySeconds * 1000);
      const dt = toDateTimeParts(nextDateTime.toISOString());

      updatedReminder = await Reminder.findByIdAndUpdate(
        id,
        {
          ...dt,
          status: "On Repeat",
          notified: false,
        },
        { new: true }
      );
    }

    return res.status(200).json(updatedReminder);
  }

  if (req.method === "DELETE") {
    await Reminder.findByIdAndDelete(id);
    return res.status(204).end();
  }

  return res.status(405).json({ error: "Method not allowed" });
}
