export const LEGAL_CONSENT_VERSION = '2026-06-29';

export function hasAcceptedLegalConsent(state) {
  return Boolean(
    state?.legalConsent
      && state.legalConsent.version === LEGAL_CONSENT_VERSION
      && state.legalConsent.acceptedAt
  );
}

export function acceptLegalConsent({ state, source = 'auth' }) {
  state.legalConsent = {
    version: LEGAL_CONSENT_VERSION,
    acceptedAt: new Date().toISOString(),
    source
  };
  return state.legalConsent;
}

export function getLegalConsentStatus(state) {
  if (!hasAcceptedLegalConsent(state)) {
    return {
      accepted: false,
      version: LEGAL_CONSENT_VERSION,
      acceptedAt: null,
      source: null
    };
  }

  return {
    accepted: true,
    version: state.legalConsent.version,
    acceptedAt: state.legalConsent.acceptedAt,
    source: state.legalConsent.source || 'unknown'
  };
}
