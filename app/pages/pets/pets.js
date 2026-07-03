const store = require('../../utils/store');

Page({
  data: { pets: [], selectedPetId: '', form: { name: '', species: '?', breed: '', avatar: '??' } },
  onShow() { this.refresh(); },
  refresh() {
    const state = getApp().globalData.state;
    this.setData({ pets: state.pets, selectedPetId: state.selectedPetId });
  },
  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },
  addPet() {
    if (!this.data.form.name.trim()) { wx.showToast({ title: '??????', icon: 'none' }); return; }
    const app = getApp();
    const next = store.addPet(app.globalData.state, this.data.form);
    app.save(next);
    this.setData({ form: { name: '', species: '?', breed: '', avatar: '??' } });
    this.refresh();
    wx.showToast({ title: '???' });
  },
  selectPet(event) {
    const app = getApp();
    app.save({ ...app.globalData.state, selectedPetId: event.currentTarget.dataset.id });
    this.refresh();
  }
});
