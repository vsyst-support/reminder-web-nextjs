import mongoose from "mongoose";

const ReminderSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    ringtime: { type: Date, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    notified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["Pending", "On Repeat", "Done"],
      default: "Pending",
    },
    onRepeat: { type: Boolean, default: false },
    intervalSeconds: { type: Number, default: 0 },
    snoozeSeconds: { type: Number, default: 0 },
    earlyReminderSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

if (mongoose.models.Reminder && !mongoose.models.Reminder.schema.path("earlyReminderSeconds")) {
  delete mongoose.models.Reminder;
}

export default mongoose.models.Reminder || mongoose.model("Reminder", ReminderSchema);
