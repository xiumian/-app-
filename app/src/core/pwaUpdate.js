export const pwaUpdateState = {
  supported: false,
  registration: null,
  waitingWorker: null,
  checking: false,
  updateAvailable: false,
  lastCheckedAt: '',
  lastAppliedAt: '',
  error: ''
};

const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isLocalDevHost = () => (
  typeof location !== 'undefined'
  && LOCAL_DEV_HOSTS.has(location.hostname)
);

const canUseServiceWorker = () => (
  typeof navigator !== 'undefined'
  && 'serviceWorker' in navigator
  && typeof location !== 'undefined'
  && location.protocol.startsWith('http')
  && !isLocalDevHost()
);

async function unregisterLocalServiceWorkers() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map(registration => registration.unregister()));
  if (typeof caches !== 'undefined' && caches.keys) {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('pet-companion-')).map(key => caches.delete(key)));
  }
}

function setWaitingWorker(worker, onUpdateFound) {
  pwaUpdateState.waitingWorker = worker || null;
  pwaUpdateState.updateAvailable = Boolean(worker);
  pwaUpdateState.error = '';
  if (worker) onUpdateFound?.(getPwaUpdateStatus());
}

export function getPwaUpdateStatus() {
  return {
    supported: pwaUpdateState.supported,
    checking: pwaUpdateState.checking,
    updateAvailable: pwaUpdateState.updateAvailable,
    lastCheckedAt: pwaUpdateState.lastCheckedAt,
    lastAppliedAt: pwaUpdateState.lastAppliedAt,
    error: pwaUpdateState.error
  };
}

export async function registerPwaUpdate({ onUpdateFound, onActivated } = {}) {
  if (isLocalDevHost()) {
    await unregisterLocalServiceWorkers();
    pwaUpdateState.supported = false;
    pwaUpdateState.registration = null;
    pwaUpdateState.waitingWorker = null;
    pwaUpdateState.updateAvailable = false;
    return getPwaUpdateStatus();
  }

  if (!canUseServiceWorker()) {
    pwaUpdateState.supported = false;
    return getPwaUpdateStatus();
  }

  pwaUpdateState.supported = true;
  pwaUpdateState.registration = await navigator.serviceWorker.register('./service-worker.js');

  if (pwaUpdateState.registration.waiting) {
    setWaitingWorker(pwaUpdateState.registration.waiting, onUpdateFound);
  }

  pwaUpdateState.registration.addEventListener('updatefound', () => {
    const installingWorker = pwaUpdateState.registration.installing;
    if (!installingWorker) return;

    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
        setWaitingWorker(installingWorker, onUpdateFound);
      }
    });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    pwaUpdateState.lastAppliedAt = new Date().toISOString();
    pwaUpdateState.updateAvailable = false;
    pwaUpdateState.waitingWorker = null;
    onActivated?.(getPwaUpdateStatus());
    if (!reloading) {
      reloading = true;
      location.reload();
    }
  });

  return getPwaUpdateStatus();
}

export async function checkForPwaUpdate() {
  if (isLocalDevHost()) {
    await unregisterLocalServiceWorkers();
    pwaUpdateState.supported = false;
    pwaUpdateState.updateAvailable = false;
    pwaUpdateState.lastCheckedAt = new Date().toISOString();
    return getPwaUpdateStatus();
  }

  if (!canUseServiceWorker()) {
    pwaUpdateState.supported = false;
    return getPwaUpdateStatus();
  }

  pwaUpdateState.supported = true;
  pwaUpdateState.checking = true;
  pwaUpdateState.error = '';
  try {
    const registration = pwaUpdateState.registration || await navigator.serviceWorker.getRegistration('./');
    if (registration) {
      pwaUpdateState.registration = registration;
      await registration.update();
      if (registration.waiting) setWaitingWorker(registration.waiting);
    }
    pwaUpdateState.lastCheckedAt = new Date().toISOString();
  } catch (error) {
    pwaUpdateState.error = error?.message || 'update check failed';
  } finally {
    pwaUpdateState.checking = false;
  }

  return getPwaUpdateStatus();
}

export function applyPwaUpdate() {
  if (!pwaUpdateState.waitingWorker) return false;
  pwaUpdateState.waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}
