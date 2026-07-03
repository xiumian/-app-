import { escapeHTML } from '../core/utils.js';

export function renderEmptyState({ icon = '🐾', title, description, actionLabel = '', action = '', className = '' }) {
  const actionButton = action && actionLabel
    ? `<button class="ghost-btn" type="button" data-action="${escapeHTML(action)}">${escapeHTML(actionLabel)}</button>`
    : '';

  return `<div class="empty-state ${escapeHTML(className)}">
    <i>${escapeHTML(icon)}</i>
    <b>${escapeHTML(title)}</b>
    <span>${escapeHTML(description)}</span>
    ${actionButton}
  </div>`;
}

export function renderRuntimeError() {
  return `<section class="shell">
    <div class="runtime-error-card">
      <div class="logo">🐾</div>
      <h1>页面暂时没加载好</h1>
      <p>数据还在本机浏览器里，可以先重试渲染；如果连续出现，再清空本地数据或把错误信息交给开发者排查。</p>
      <div class="post-actions">
        <button class="primary-btn" type="button" data-action="retry-render">重试</button>
        <button class="ghost-btn" type="button" data-action="clear-data">清空本地数据</button>
      </div>
    </div>
  </section>`;
}
