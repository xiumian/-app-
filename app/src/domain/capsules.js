export function createCapsule({ uid, petId, title, imageData }) {
  return {
    id: uid('ph'),
    petId,
    title,
    imageData,
    createdAt: new Date().toISOString()
  };
}

export function petCapsules({ state, petId }) {
  return state.photos
    .filter(photo => photo.petId === petId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function latestCapsules({ state, petId, limit = 3 }) {
  return petCapsules({ state, petId }).slice(0, limit);
}
