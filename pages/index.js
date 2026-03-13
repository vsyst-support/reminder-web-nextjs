import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import connectToDatabase from "../lib/mongodb";
import Reminder from "../models/reminder";

// Prevent duplicate notifications for the same reminder occurrence.
const inFlightNotificationKeys = new Set();
const deliveredNotificationKeys = new Set();

function toLocalInputValue(value) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value) {
  const date = new Date(value);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function Home({ initialReminders }) {
  const router = useRouter();
  const [reminders, setReminders] = useState(initialReminders);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    ringtime: toLocalInputValue(new Date()),
    onRepeat: false,
    intervalSeconds: 0,
    earlyReminderSeconds: 0,
  });
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    ringtime: toLocalInputValue(new Date()),
    status: "Pending",
    onRepeat: false,
    intervalSeconds: 0,
    snoozeSeconds: 0,
    earlyReminderSeconds: 0,
  });

  useEffect(() => {
    setReminders(initialReminders);
  }, [initialReminders]);

  useEffect(() => {
    if (!isCreateModalOpen && !isUpdateModalOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onEscPress = (event) => {
      if (event.key === "Escape") {
        setIsCreateModalOpen(false);
        setIsUpdateModalOpen(false);
        setEditingReminderId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onEscPress);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscPress);
    };
  }, [isCreateModalOpen, isUpdateModalOpen]);

  useEffect(() => {
    const timerIds = [];

    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    reminders.forEach((r) => {
      if (r.notified) return;
      const scheduleTime = new Date(r.ringtime);
      const earlySeconds = Math.max(0, Number(r.earlyReminderSeconds) || 0);

      const scheduleNotification = (targetTime, phase) => {
        const now = new Date();
        const delay = Math.max(0, targetTime.getTime() - now.getTime());

        const timerId = window.setTimeout(async () => {
          const occurrenceKey = `${r._id}:${scheduleTime.getTime()}:${phase}`;
        if (
          deliveredNotificationKeys.has(occurrenceKey) ||
          inFlightNotificationKeys.has(occurrenceKey)
        ) {
          return;
        }
        inFlightNotificationKeys.add(occurrenceKey);

        const markDoneAndRefresh = async () => {
          await fetch(`/api/reminders/${r._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...r,
              status: "Done",
              onRepeat: r.onRepeat,
              intervalSeconds: r.intervalSeconds,
              snoozeSeconds: r.snoozeSeconds,
              notified: true,
            }),
          });
          router.replace(router.asPath);
        };

        const snoozeAndRefresh = async () => {
          const snoozeDelay = Number(r.snoozeSeconds) || 0;
          if (snoozeDelay <= 0) {
            return false;
          }

          const snoozeUntil = new Date(Date.now() + snoozeDelay * 1000).toISOString();
          await fetch(`/api/reminders/${r._id}/snooze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ snoozeUntil }),
          });
          deliveredNotificationKeys.add(occurrenceKey);
          router.replace(router.asPath);
          return true;
        };

        try {
          const playRingSound = () => {
            const sound = document.getElementById("notificationSound");
            if (!sound) return;
            // Restart audio so each reminder phase rings at its exact trigger time.
            sound.currentTime = 0;
            sound.play().catch(() => null);
          };

          playRingSound();

          if (phase === "early") {
            if (Notification.permission === "granted") {
              new Notification(`Early Reminder: ${r.title}`, {
                body: `Starts in ${earlySeconds} second${earlySeconds === 1 ? "" : "s"}.`,
              });
            }
            deliveredNotificationKeys.add(occurrenceKey);
            return;
          }

          if (r.onRepeat && r.intervalSeconds > 0) {
            const continueRepeatingReminder = async () => {
              deliveredNotificationKeys.add(occurrenceKey);
              await markDoneAndRefresh();
            };

            if (Notification.permission === "granted") {
              const notifi = new Notification(`Reminder: ${r.title}`, {
                body: r.description || "",
              });

              let handledByClick = false;
              notifi.onclick = async () => {
                handledByClick = true;
                window.focus();
                const stopRepeat = window.confirm(
                  "Stop this repeating reminder? Cancel snoozes it if snooze seconds is set."
                );

                if (stopRepeat) {
                  deliveredNotificationKeys.add(occurrenceKey);
                  await fetch(`/api/reminders/${r._id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ...r,
                      status: "Done",
                      onRepeat: false,
                      intervalSeconds: 0,
                      snoozeSeconds: 0,
                      notified: true,
                    }),
                  });
                  router.replace(router.asPath);
                  return;
                }

                const snoozed = await snoozeAndRefresh();
                if (snoozed) return;
                await continueRepeatingReminder();
              };

              window.setTimeout(async () => {
                if (handledByClick) return;
                await continueRepeatingReminder();
              }, 4000);
            } else {
              window.alert(`Reminder: ${r.title}`);
              await continueRepeatingReminder();
            }
            return;
          }

          if (Notification.permission === "granted") {
            const notifi = new Notification(`Reminder: ${r.title}`, {
              body: r.description || "",
            });

            deliveredNotificationKeys.add(occurrenceKey);
            notifi.onclick = async () => {
              window.focus();
              const markDone = window.confirm(
                "Mark this reminder as Done? Cancel snoozes it if snooze seconds is set."
              );
              if (!markDone) {
                await snoozeAndRefresh();
                return;
              }

              await markDoneAndRefresh();
            };
          } else {
            window.alert(`Reminder: ${r.title}`);
            deliveredNotificationKeys.add(occurrenceKey);
          }
        } finally {
          inFlightNotificationKeys.delete(occurrenceKey);
        }
        }, delay);

        timerIds.push(timerId);
      };

      if (earlySeconds > 0) {
        const earlyTime = new Date(scheduleTime.getTime() - earlySeconds * 1000);
        scheduleNotification(earlyTime, "early");
      }
      scheduleNotification(scheduleTime, "main");
    });

    return () => {
      timerIds.forEach((id) => window.clearTimeout(id));
    };
  }, [reminders, router]);

  const filteredReminders = useMemo(() => {
    return reminders.filter((r) => {
      const byStatus = statusFilter === "all" || r.status === statusFilter;
      const bySearch =
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        (r.description || "").toLowerCase().includes(search.toLowerCase());
      return byStatus && bySearch;
    });
  }, [reminders, search, statusFilter]);

  async function createReminder(e) {
    e.preventDefault();
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({
      title: "",
      description: "",
      ringtime: toLocalInputValue(new Date()),
      onRepeat: false,
      intervalSeconds: 0,
      earlyReminderSeconds: 0,
    });
    setIsCreateModalOpen(false);
    router.replace(router.asPath);
  }

  async function deleteReminder(id) {
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    router.replace(router.asPath);
  }

  function openUpdateModal(reminder) {
    setEditingReminderId(reminder._id);
    setEditForm({
      title: reminder.title || "",
      description: reminder.description || "",
      ringtime: toLocalInputValue(reminder.ringtime),
      status: reminder.status || "Pending",
      onRepeat: Boolean(reminder.onRepeat),
      intervalSeconds: reminder.intervalSeconds || 0,
      snoozeSeconds: reminder.snoozeSeconds || 0,
      earlyReminderSeconds: reminder.earlyReminderSeconds || 0,
    });
    setIsUpdateModalOpen(true);
  }

  async function updateReminder(e) {
    e.preventDefault();
    if (!editingReminderId) return;

    await fetch(`/api/reminders/${editingReminderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });

    setIsUpdateModalOpen(false);
    setEditingReminderId(null);
    router.replace(router.asPath);
  }

  return (
    <>
      <Head>
        <title>Reminder App</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="create-reminder-bar">
        <h2 className="reminders-title">My Reminders</h2>
        <button className="create-reminder-btn" type="button" onClick={() => setIsCreateModalOpen(true)}>
          Create Reminder
        </button>
        <div className="filters-wrap">
          <div id="statusChips">
            <button className={`chip ${statusFilter === "all" ? "active" : ""}`} onClick={() => setStatusFilter("all")}>
              All
            </button>
            <button
              className={`chip ${statusFilter === "Pending" ? "active" : ""}`}
              onClick={() => setStatusFilter("Pending")}
            >
              Pending
            </button>
            <button
              className={`chip ${statusFilter === "On Repeat" ? "active" : ""}`}
              onClick={() => setStatusFilter("On Repeat")}
            >
              On Repeat
            </button>
            <button className={`chip ${statusFilter === "Done" ? "active" : ""}`} onClick={() => setStatusFilter("Done")}>
              Done
            </button>
          </div>

          <div className="search-input-wrap">
            <input
              type="text"
              id="searchInput"
              placeholder="Search reminders..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button
                className="search-clear-btn"
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                &times;
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {isCreateModalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-reminder-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsCreateModalOpen(false);
            }
          }}
        >
          <div className="container modal-container">
            <div className="modal-header">
              <h1 className="modal-title" id="create-reminder-title">Add New Reminder</h1>
              <button className="modal-close-btn" type="button" onClick={() => setIsCreateModalOpen(false)} aria-label="Close">
                &times;
              </button>
            </div>

            <form className="reminder-form" onSubmit={createReminder}>
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

              <div className="form-group repeat-toggle-group">
                <label htmlFor="repeat-switch">Repeat Reminder:</label>
                <label className="switch">
                  <input
                    id="repeat-switch"
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

              <button className="add_button" type="submit">
                Add Reminder
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {isUpdateModalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-reminder-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsUpdateModalOpen(false);
              setEditingReminderId(null);
            }
          }}
        >
          <div className="container modal-container update-modal-container">
            <div className="modal-header">
              <h1 className="modal-title" id="update-reminder-title">Update Reminder</h1>
              <button
                className="modal-close-btn"
                type="button"
                onClick={() => {
                  setIsUpdateModalOpen(false);
                  setEditingReminderId(null);
                }}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form className="reminder-form" onSubmit={updateReminder}>
              <div className="input-group">
                <input
                  type="text"
                  required
                  placeholder=" "
                  value={editForm.title}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                />
                <label>Title</label>
              </div>

              <div className="input-group">
                <textarea
                  rows={2}
                  placeholder=" "
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <label>Description</label>
              </div>

              <div className="input-group">
                <input
                  type="datetime-local"
                  required
                  value={editForm.ringtime}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, ringtime: e.target.value }))}
                />
                <label>Reminder Date & Time</label>
              </div>

              <div className="form-group status-group">
                <label htmlFor="edit-status">Status</label>
                <select
                  id="edit-status"
                  className="status-select"
                  value={editForm.status}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
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
                    checked={editForm.onRepeat}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, onRepeat: e.target.checked }))}
                  />
                  <span className="slider" />
                </label>
              </div>

              <div className="form-group timing-group">
                <label htmlFor="edit-intervalSeconds">Repeat Interval (Seconds)</label>
                <div className="timing-input-wrap">
                  <input
                    id="edit-intervalSeconds"
                    className="timing-input"
                    type="number"
                    min={0}
                    value={editForm.intervalSeconds}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, intervalSeconds: Math.max(0, Number(e.target.value) || 0) }))
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-group timing-group">
                <label htmlFor="edit-snoozeSeconds">Snooze Time (Seconds)</label>
                <div className="timing-input-wrap">
                  <input
                    id="edit-snoozeSeconds"
                    className="timing-input"
                    type="number"
                    min={0}
                    value={editForm.snoozeSeconds}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, snoozeSeconds: Math.max(0, Number(e.target.value) || 0) }))
                    }
                  />
                </div>
              </div>

              <div className="form-group timing-group">
                <label htmlFor="edit-earlyReminderSeconds">Early Reminder (Seconds)</label>
                <div className="timing-input-wrap">
                  <input
                    id="edit-earlyReminderSeconds"
                    className="timing-input"
                    type="number"
                    min={0}
                    value={editForm.earlyReminderSeconds}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        earlyReminderSeconds: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  className="cancel_button"
                  type="button"
                  onClick={() => {
                    setIsUpdateModalOpen(false);
                    setEditingReminderId(null);
                  }}
                >
                  Cancel
                </button>
                <button className="add_button" type="submit">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ul className="reminder-list">
        {filteredReminders.map((r) => (
          <li className="reminder-card" key={r._id}>
            <div className="reminder-content">
              <div className="reminder-title">
                {r.title}
                <span className={`status-badge ${r.status.toLowerCase().replace(/\s+/g, "-")}`}>{r.status}</span>
              </div>
              {r.onRepeat && r.intervalSeconds > 0 ? (
                <p className="repeat-note">Repeats every {r.intervalSeconds} sec</p>
              ) : null}
              <p>{r.description}</p>
              <small>{formatDateTime(r.ringtime)}</small>
            </div>

            <div className="row">
              {r.status !== "Done" ? (
                <button
                  type="button"
                  className="edit-btn"
                  aria-label="Edit reminder"
                  title="Edit reminder"
                  onClick={() => openUpdateModal(r)}
                >
                  <svg className="edit-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M14.06,9L15,9.94L5.92,19H5V18.08L14.06,9M17.66,3C17.41,3 17.16,3.1 16.97,3.29L15.13,5.13L18.87,8.87L20.71,7.03C21.1,6.64 21.1,6 20.71,5.61L18.39,3.29C18.19,3.1 17.94,3 17.66,3M14.06,6.2L3,17.27V21H6.73L17.8,9.93L14.06,6.2Z" />
                  </svg>
                </button>
              ) : null}
              <button
                className="delete-btn margin_right"
                aria-label="Delete reminder"
                title="Delete reminder"
                onClick={() => deleteReminder(r._id)}
              >
                <svg className="delete-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>

      <audio id="notificationSound" src="/notification.mp3" preload="auto" />
    </>
  );
}

export async function getServerSideProps() {
  await connectToDatabase();
  const reminders = await Reminder.find().sort({ date: -1, time: -1 }).lean();
  const initialReminders = reminders.map((item) => ({
    ...item,
    _id: String(item._id),
    ringtime: new Date(item.ringtime).toISOString(),
  }));

  return {
    props: {
      initialReminders: JSON.parse(JSON.stringify(initialReminders)),
    },
  };
}

