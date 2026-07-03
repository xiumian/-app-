const store = require('../../utils/store');

Page({
  data: { pet: {}, checkins: [], records: [], percent: 0, doneCount: 0, totalCount: 0, summaryText: '' },
  onShow() { this.refresh(); },
  refresh() {
    const app = getApp();
    const state = app.globalData.state;
    const pet = store.selectedPet(state) || {};
    const checkins = store.todayCheckins(state);
    const doneCount = checkins.filter(item => item.done).length;
    const records = state.records.filter(item => item.petId === pet.id).slice(0, 3);
    this.setData({ pet, checkins, records, percent: store.completion(state), doneCount, totalCount: checkins.length, summaryText: doneCount === checkins.length && checkins.length ? '???????' : '????????' });
  },
  toggleCheckin(event) {
    const id = event.currentTarget.dataset.id;
    const app = getApp();
    const state = app.globalData.state;
    const next = { ...state, checkins: state.checkins.map(item => item.id === id ? { ...item, done: !item.done } : item) };
    app.save(next);
    this.refresh();
  }
});
