const STORAGE_KEY = 'pet_companion_miniprogram_state_v1';

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function today() {
  const date = new Date();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function createInitialState() {
  const petId = 'pet_milk';
  return {
    user: { name: '??' },
    selectedPetId: petId,
    pets: [
      { id: petId, name: '??', avatar: '??', species: '?', breed: '???', gender: '??', weight: '4.2', note: '?????????????????' }
    ],
    checkins: [
      { id: 'feed', petId, title: '??', icon: '??', done: false, date: today() },
      { id: 'water', petId, title: '??', icon: '??', done: false, date: today() },
      { id: 'litter', petId, title: '??', icon: '??', done: false, date: today() }
    ],
    records: [
      { id: 'rec_seed', petId, type: '????', content: '?????????????????', createdAt: '06/29 20:17' }
    ]
  };
}

function loadState() {
  try {
    const saved = wx.getStorageSync(STORAGE_KEY);
    if (saved && saved.pets && saved.checkins && saved.records) return saved;
  } catch (error) {}
  const state = createInitialState();
  saveState(state);
  return state;
}

function saveState(state) {
  wx.setStorageSync(STORAGE_KEY, state);
}

function resetState() {
  const state = createInitialState();
  saveState(state);
  return state;
}

function selectedPet(state) {
  return state.pets.find(item => item.id === state.selectedPetId) || state.pets[0] || null;
}

function todayCheckins(state) {
  const pet = selectedPet(state);
  if (!pet) return [];
  return state.checkins.filter(item => item.petId === pet.id && item.date === today());
}

function completion(state) {
  const list = todayCheckins(state);
  if (!list.length) return 0;
  return Math.round(list.filter(item => item.done).length / list.length * 100);
}

function addPet(state, payload) {
  const id = uid('pet');
  const pet = { id, avatar: payload.avatar || '??', name: payload.name || '???', species: payload.species || '??', breed: payload.breed || '', gender: payload.gender || '??', weight: payload.weight || '', note: payload.note || '' };
  const next = { ...state, selectedPetId: id, pets: [pet, ...state.pets] };
  next.checkins = [
    { id: uid('feed'), petId: id, title: '??', icon: '??', done: false, date: today() },
    { id: uid('water'), petId: id, title: '??', icon: '??', done: false, date: today() },
    { id: uid('clean'), petId: id, title: '??', icon: '??', done: false, date: today() },
    ...state.checkins
  ];
  return next;
}

function addRecord(state, payload) {
  const pet = selectedPet(state);
  if (!pet) return state;
  const now = new Date();
  const createdAt = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const record = { id: uid('rec'), petId: pet.id, type: payload.type || '????', content: payload.content || '', createdAt };
  return { ...state, records: [record, ...state.records] };
}

module.exports = { createInitialState, loadState, saveState, resetState, selectedPet, todayCheckins, completion, addPet, addRecord };
