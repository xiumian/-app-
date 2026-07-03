const toastEl = document.querySelector('#toast');

export function toast(message, { durationMs = 1800 } = {}) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => toastEl.classList.remove('show'), durationMs);
}
