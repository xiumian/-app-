const { createInitialState, loadState, saveState } = require('./utils/store');

App({
  globalData: {
    state: createInitialState()
  },
  onLaunch() {
    this.globalData.state = loadState();
  },
  save(nextState) {
    this.globalData.state = nextState;
    saveState(nextState);
  }
});
