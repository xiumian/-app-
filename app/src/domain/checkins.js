import { todayISO } from '../core/utils.js';

export const CHECKIN_PRESETS = [
  { icon: '💧', title: '饮水', time: '08:00' },
  { icon: '🥣', title: '喂食', time: '08:30' },
  { icon: '💩', title: '铲屎', time: '19:15' },
  { icon: '🍗', title: '晚餐', time: '20:30' },
  { icon: '🛁', title: '洗澡', time: '周末' },
  { icon: '🪮', title: '梳毛', time: '21:00' }
];

export const DEFAULT_CHECKINS = [
  { icon: '💧', title: '饮水', time: '08:00', done: false },
  { icon: '💩', title: '铲屎', time: '19:15', done: true },
  { icon: '🍗', title: '晚餐', time: '20:30', done: false }
];

export function ensureDefaultCheckins({ state, uid, petId }) {
  const today = todayISO();
  const exists = state.checkins.some(item => item.petId === petId && item.date === today);
  if (exists) return;

  for (const item of DEFAULT_CHECKINS) {
    state.checkins.push(createCheckin({ state, uid, petId, ...item }));
  }
}

export function createCheckin({ state, uid, petId, icon = '🐾', title, time = '全天', done = false }) {
  return {
    id: uid('chk'),
    userId: state.currentUserId,
    petId,
    icon,
    title,
    time,
    date: todayISO(),
    done,
    createdAt: new Date().toISOString()
  };
}

export function hasCheckinTitleToday({ state, petId, title }) {
  const today = todayISO();
  return state.checkins.some(item => item.petId === petId && item.date === today && item.title === title);
}

export function getCheckinSummary(items) {
  const total = items.length;
  const done = items.filter(item => item.done).length;
  return {
    total,
    done,
    pending: Math.max(0, total - done),
    percent: total ? Math.round((done / total) * 100) : 0
  };
}

export function toggleCheckinDone({ state, id }) {
  const item = state.checkins.find(checkin => checkin.id === id);
  if (item) item.done = !item.done;
  return item;
}

export function setTodayCheckinsDone({ state, petId, done }) {
  const today = todayISO();
  let changed = 0;
  for (const item of state.checkins) {
    if (item.petId === petId && item.date === today && item.done !== done) {
      item.done = done;
      changed += 1;
    }
  }
  return changed;
}

export function deleteCheckinById({ state, id }) {
  const before = state.checkins.length;
  state.checkins = state.checkins.filter(checkin => checkin.id !== id);
  return before !== state.checkins.length;
}
