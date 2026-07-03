import { state } from '../core/state.js';
import { selectedPet, userPets } from '../core/selectors.js';

function setupCanvas(id) {
  const canvas = document.querySelector(id);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fffaf2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(143,101,69,.10)';
  for (let x = 0; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  return { canvas, ctx };
}

function drawEmpty(ctx, canvas, text) {
  ctx.fillStyle = '#9a8778';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

export function drawVisibleCharts() {
  drawWeightChart();
  drawRecordChart();
  drawReminderChart();
}

function drawWeightChart() {
  const setup = setupCanvas('#weight-chart');
  if (!setup) return;
  const { canvas, ctx } = setup;
  const pet = selectedPet();
  const data = state.records
    .filter(record => record.petId === pet?.id && record.type === '体重' && typeof record.numericValue === 'number')
    .sort((a, b) => new Date(a.happenedAt) - new Date(b.happenedAt));

  if (!data.length) return drawEmpty(ctx, canvas, '暂无体重数据');

  const values = data.map(item => item.numericValue);
  const min = Math.min(...values) - 0.2;
  const max = Math.max(...values) + 0.2;
  const pad = 54;
  ctx.strokeStyle = '#8f6545';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  data.forEach((item, index) => {
    const x = pad + index * ((canvas.width - pad * 2) / Math.max(1, data.length - 1));
    const y = canvas.height - pad - ((item.numericValue - min) / Math.max(0.1, max - min)) * (canvas.height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawRecordChart() {
  const setup = setupCanvas('#record-chart');
  if (!setup) return;
  const { canvas, ctx } = setup;
  const pets = userPets();
  const counts = {};
  state.records
    .filter(record => pets.some(pet => pet.id === record.petId))
    .forEach(record => counts[record.type] = (counts[record.type] || 0) + 1);
  const entries = Object.entries(counts);
  if (!entries.length) return drawEmpty(ctx, canvas, '暂无护理记录');
  const max = Math.max(...entries.map(([, value]) => value));

  entries.forEach(([label, value], index) => {
    const y = 52 + index * 56;
    ctx.fillStyle = ['#8f6545', '#f5b866', '#48cf7b', '#ce675e', '#c7ad9b'][index % 5];
    ctx.fillRect(150, y, (canvas.width - 220) * value / max, 28);
    ctx.fillStyle = '#49372a';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(label, 130, y + 23);
    ctx.textAlign = 'left';
    ctx.fillText(value, 160 + (canvas.width - 220) * value / max, y + 23);
  });
}

function drawReminderChart() {
  const setup = setupCanvas('#reminder-chart');
  if (!setup) return;
  const { canvas, ctx } = setup;
  const pets = userPets();
  const all = state.reminders.filter(reminder => pets.some(pet => pet.id === reminder.petId));
  if (!all.length) return drawEmpty(ctx, canvas, '暂无提醒数据');
  const done = all.filter(reminder => reminder.done).length;
  const todo = all.length - done;
  const total = Math.max(1, all.length);

  [
    { label: '已完成', value: done, color: '#48cf7b' },
    { label: '待完成', value: todo, color: '#8f6545' }
  ].forEach((bar, index) => {
    const x = 90 + index * 260;
    const h = 150 * bar.value / total;
    ctx.fillStyle = bar.color;
    ctx.fillRect(x, 190 - h, 140, h);
    ctx.fillStyle = '#49372a';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${bar.label} ${bar.value}`, x + 70, 230);
  });
}
