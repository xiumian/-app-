import { state, saveState } from './state.js';
import { todayISO } from './utils.js';
import { canAccessPet, filterOwnedPetResources, filterOwnedPets } from './policies.js';

export function currentUser() {
  return state.users.find(user => user.id === state.currentUserId) || null;
}

export function userPets() {
  return filterOwnedPets(state);
}

export function selectedPet() {
  const pets = userPets();
  if (!pets.length) return null;

  if (!state.selectedPetId || !pets.some(pet => pet.id === state.selectedPetId)) {
    state.selectedPetId = pets[0].id;
    saveState();
  }

  return pets.find(pet => pet.id === state.selectedPetId) || pets[0];
}

export function petName(petId) {
  if (!canAccessPet(state, petId)) return '未关联宠物';
  return state.pets.find(pet => pet.id === petId)?.name || '未关联宠物';
}

export function petOptions(selected = '') {
  const pets = userPets();
  if (!pets.length) return '<option value="">先添加宠物</option>';
  return pets.map(pet => `<option value="${pet.id}" ${pet.id === selected ? 'selected' : ''}>${pet.avatar} ${pet.name}</option>`).join('');
}

export function todayCheckins(petId = selectedPet()?.id) {
  const today = todayISO();
  return filterOwnedPetResources(state, state.checkins)
    .filter(item => item.date === today && (!petId || item.petId === petId))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

export function currentPetReminders() {
  return filterOwnedPetResources(state, state.reminders)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate));
}
