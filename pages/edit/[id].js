import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";
import connectToDatabase from "../../lib/mongodb";
import Reminder from "../../models/reminder";

function toLocalInputValue(value) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function EditReminder({ reminder }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: reminder.title || "",
    description: reminder.description || "",
    ringtime: toLocalInputValue(reminder.ringtime),
    status: reminder.status || "Pending",
    onRepeat: Boolean(reminder.onRepeat),
    intervalSeconds: reminder.intervalSeconds || 0,
    snoozeSeconds: reminder.snoozeSeconds || 0,
    earlyReminderSeconds: reminder.earlyReminderSeconds || 0,
  });

  async function onSubmit(e) {
    e.preventDefault();
    await fetch(`/api/reminders/${reminder._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    router.push("/");
  }

  return (
    <>
      <Head>
        <title>Edit Reminder</title>
      </Head>

      <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="update-reminder-title">
        <div className="container modal-container update-modal-container">
          <div className="modal-header">
            <h1 className="modal-title" id="update-reminder-title">Update Reminder</h1>
            <button className="modal-close-btn" type="button" onClick={() => router.push("/")} aria-label="Close">
              &times;
            </button>
          </div>

          <form className="reminder-form" onSubmit={onSubmit}>
            <div className="input-group">
              <input
                type="text"
                required
                placeholder=" "
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <label>Title</label>
            </div>

            <div className="input-group">
              <textarea
                rows={2}
                placeholder=" "
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
              <label>Description</label>
            </div>

            <div className="input-group">
              <input
                type="datetime-local"
                required
                value={form.ringtime}
                onChange={(e) => setForm((prev) => ({ ...prev, ringtime: e.target.value }))}
              />
              <label>Reminder Date & Time</label>
            </div>

            <div className="form-group status-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
                className="status-select"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                <option value="Pending">Pending</option>
                <option value="On Repeat">On Repeat</option>
                <option value="Done">Done</option>
              </select>
            </div>

            <div className="form-group repeat-toggle-group">
              <label htmlFor="edit-repeat-switch">Repeat Reminder:</label>
              <label className="switch">
                <input
                  id="edit-repeat-switch"
                  type="checkbox"
                  checked={form.onRepeat}
                  onChange={(e) => setForm((prev) => ({ ...prev, onRepeat: e.target.checked }))}
                />
                <span className="slider" />
              </label>
            </div>

            <div className="form-group timing-group">
              <label htmlFor="intervalSeconds">Repeat Interval (Seconds)</label>
              <div className="timing-input-wrap">
                <input
                  id="intervalSeconds"
                  className="timing-input"
                  type="number"
                  min={0}
                  value={form.intervalSeconds}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, intervalSeconds: Math.max(0, Number(e.target.value) || 0) }))
                  }
                  required
                />
              </div>
            </div>

            <div className="form-group timing-group">
              <label htmlFor="snoozeSeconds">Snooze Time (Seconds)</label>
              <div className="timing-input-wrap">
                <input
                  id="snoozeSeconds"
                  className="timing-input"
                  type="number"
                  min={0}
                  value={form.snoozeSeconds}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, snoozeSeconds: Math.max(0, Number(e.target.value) || 0) }))
                  }
                />
              </div>
            </div>

            <div className="form-group timing-group">
              <label htmlFor="earlyReminderSeconds">Early Reminder (Seconds)</label>
              <div className="timing-input-wrap">
                <input
                  id="earlyReminderSeconds"
                  className="timing-input"
                  type="number"
                  min={0}
                  value={form.earlyReminderSeconds}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      earlyReminderSeconds: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="cancel_button" type="button" onClick={() => router.push("/")}>
                Cancel
              </button>
              <button className="add_button" type="submit">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps({ params }) {
  await connectToDatabase();
  const reminder = await Reminder.findById(params.id).lean();

  if (!reminder) {
    return { notFound: true };
  }

  return {
    props: {
      reminder: {
        ...JSON.parse(JSON.stringify(reminder)),
        _id: String(reminder._id),
        ringtime: new Date(reminder.ringtime).toISOString(),
      },
    },
  };
}
