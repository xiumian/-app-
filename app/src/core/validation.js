export const MAX_LOCAL_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const IMAGE_UPLOAD_ACCEPT = Array.from(ALLOWED_IMAGE_TYPES).join(',');
export const IMAGE_UPLOAD_HELP_TEXT = '支持 JPG、PNG、WebP、GIF，单张不超过 5MB。';

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function cleanText(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
}

export function requiredText(formData, name, label, { max = 80 } = {}) {
  const value = cleanText(formData.get(name));
  if (!value) throw new ValidationError(`请填写${label}`);
  if (value.length > max) throw new ValidationError(`${label}最多 ${max} 个字`);
  return value;
}

export function optionalText(formData, name, label, { max = 160, fallback = '' } = {}) {
  const value = cleanText(formData.get(name)) || fallback;
  if (value.length > max) throw new ValidationError(`${label}最多 ${max} 个字`);
  return value;
}

export function selectedValue(formData, name, label) {
  const value = cleanText(formData.get(name));
  if (!value) throw new ValidationError(`请选择${label}`);
  return value;
}

export function requiredDate(formData, name, label) {
  const value = selectedValue(formData, name, label);
  if (Number.isNaN(new Date(value).getTime())) throw new ValidationError(`${label}格式不正确`);
  return value;
}

export function optionalPositiveNumber(formData, name, label) {
  const raw = cleanText(formData.get(name));
  if (!raw) return '';
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new ValidationError(`${label}必须是大于等于 0 的数字`);
  return value;
}

export function validateImageFile(file, { maxBytes = MAX_LOCAL_IMAGE_BYTES } = {}) {
  if (!file || !file.size) throw new ValidationError('请选择图片');
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new ValidationError('只能上传 JPG、PNG、WebP 或 GIF 图片');
  if (file.size > maxBytes) throw new ValidationError('图片太大，请选择 5MB 以内的图片');
  return file;
}
