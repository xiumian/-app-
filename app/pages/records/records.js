const store = require('../../utils/store');

Page({
  data: { records: [], form: { type: '', content: '' } },
  onShow() { this.refresh(); },
  refresh() {
    const state = getApp().globalData.state;
    const records = state.records.map(item => ({ ...item, petName: (state.pets.find(pet => pet.id === item.petId) || {}).name || '??' }));
    this.setData({ records });
  },
  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },
  addRecord() {
    if (!this.data.form.content.trim()) { wx.showToast({ title: '???????', icon: 'none' }); return; }
    const app = getApp();
    app.save(store.addRecord(app.globalData.state, this.data.form));
    this.setData({ form: { type: '', content: '' } });
    this.refresh();
    wx.showToast({ title: '???' });
  }
});
