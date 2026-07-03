import { optionalPositiveNumber, optionalText, requiredText, selectedValue } from '../core/validation.js';

export function sanitizePetColor(value, fallback = '#f2e7d9') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export function createPetFromForm({ uid, ownerId, formData, avatarImage = '' }) {
  const birthdayMode = selectedValue(formData, 'birthdayMode', '生日选项');
  return {
    id: uid('p'),
    ownerId,
    name: requiredText(formData, 'name', '宠物名', { max: 20 }),
    species: selectedValue(formData, 'species', '类型'),
    breed: optionalText(formData, 'breed', '品种', { max: 24 }),
    gender: selectedValue(formData, 'gender', '性别'),
    birthdayMode,
    birthday: birthdayMode === 'unknown' ? '' : optionalText(formData, 'birthday', '日期', { max: 20 }),
    weight: optionalPositiveNumber(formData, 'weight', '体重'),
    avatar: selectedValue(formData, 'avatar', '头像'),
    avatarImage,
    color: sanitizePetColor(selectedValue(formData, 'color', '头像色')),
    note: optionalText(formData, 'note', '照护备注', { max: 160 }),
    createdAt: new Date().toISOString()
  };
}

export function createDemoPet({ uid, ownerId }) {
  return {
    id: uid('p'),
    ownerId,
    name: '奶盖',
    species: '猫',
    breed: '银渐层',
    gender: '弟弟',
    birthdayMode: 'birthday',
    birthday: '2024-10-12',
    weight: 4.2,
    avatar: '🐱',
    avatarImage: '',
    color: '#f2e7d9',
    note: '胆子小，出门前先把航空箱放在客厅 20 分钟。换粮期注意软便。',
    createdAt: new Date().toISOString()
  };
}

export function deletePetCascade({ state, petId }) {
  const pet = state.pets.find(item => item.id === petId);
  if (!pet) {
    return {
      deleted: false,
      pet: 0,
      reminders: 0,
      records: 0,
      photos: 0,
      posts: 0,
      checkins: 0
    };
  }

  const before = {
    reminders: state.reminders.length,
    records: state.records.length,
    photos: state.photos.length,
    posts: state.posts.length,
    checkins: state.checkins.length
  };

  state.pets = state.pets.filter(item => item.id !== petId);
  state.reminders = state.reminders.filter(item => item.petId !== petId);
  state.records = state.records.filter(item => item.petId !== petId);
  state.photos = state.photos.filter(item => item.petId !== petId);
  state.posts = state.posts.filter(item => item.petId !== petId);
  state.checkins = state.checkins.filter(item => item.petId !== petId);

  if (state.selectedPetId === petId) {
    state.selectedPetId = state.pets.find(item => item.ownerId === pet.ownerId)?.id || null;
  }
  if (state.ui?.detailPetId === petId) {
    state.ui.detailPetId = null;
  }

  return {
    deleted: true,
    pet: 1,
    reminders: before.reminders - state.reminders.length,
    records: before.records - state.records.length,
    photos: before.photos - state.photos.length,
    posts: before.posts - state.posts.length,
    checkins: before.checkins - state.checkins.length
  };
}
