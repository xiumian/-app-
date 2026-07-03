const store = require('../../utils/store');

Page({
  data: { petCount: 0, recordCount: 0, pendingCount: 0 },
  onShow() { this.refresh(); },
  refresh() {
    const state = getApp().globalData.state;
    this.setData({ petCount: state.pets.length, recordCount: state.records.length, pendingCount: store.todayCheckins(state).filter(item => !item.done).length });
  },
  resetData() {
    wx.showModal({
      title: '?????',
      content: '?????????????????????????',
      confirmText: '????',
      confirmColor: '#ce675e',
      success: res => {
        if (!res.confirm) return;
        getApp().save(store.resetState());
        this.refresh();
        wx.showToast({ title: '???' });
      }
    });
  }
});
