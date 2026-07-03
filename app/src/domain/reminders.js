import { offsetDate } from '../core/utils.js';

export const REMINDER_PRESETS = [
  { icon: '💊', type: '吃药', title: '吃药提醒', daysFromNow: 0, note: '按医嘱完成后标记。' },
  { icon: '🏥', type: '就医', title: '就医复查', daysFromNow: 7, note: '出门前准备病历和航空箱。' },
  { icon: '🪱', type: '驱虫', title: '体内外驱虫', daysFromNow: 30, note: '完成后记录下次驱虫时间。' },
  { icon: '💉', type: '疫苗', title: '年度疫苗', daysFromNow: 90, note: '带疫苗本复查。' },
  { icon: '🛁', type: '洗澡', title: '洗澡护理', daysFromNow: 14, note: '洗后注意保暖。' }
];

export function createReminder({ uid, petId, type, title, dueDate, note = '', icon = '🔔', done = false }) {
  return {
    id: uid('r'),
    petId,
    type,
    title,
    dueDate,
    note,
    icon,
    done,
    createdAt: new Date().toISOString()
  };
}

export function createPresetReminder({ uid, petId, preset }) {
  return createReminder({
    uid,
    petId,
    type: preset.type,
    title: preset.title,
    dueDate: offsetDate(preset.daysFromNow),
    note: preset.note,
    icon: preset.icon
  });
}

export function hasOpenReminder({ state, petId, title, type }) {
  return state.reminders.some(item =>
    item.petId === petId &&
    !item.done &&
    item.title === title &&
    item.type === type
  );
}
