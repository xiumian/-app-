export function currentUserId(state) {
  return state.currentUserId || null;
}

export function userPetIds(state, userId = currentUserId(state)) {
  if (!userId) return new Set();
  return new Set(state.pets.filter(pet => pet.ownerId === userId).map(pet => pet.id));
}

export function canAccessPet(state, petId, userId = currentUserId(state)) {
  if (!petId || !userId) return false;
  return state.pets.some(pet => pet.id === petId && pet.ownerId === userId);
}

export function canAccessPetResource(state, resource, userId = currentUserId(state)) {
  if (!resource) return false;
  return canAccessPet(state, resource.petId, userId);
}

export function canAccessPost(state, post, userId = currentUserId(state)) {
  if (!post || !userId) return false;
  return post.authorId === userId || canAccessPet(state, post.petId, userId);
}

export function canDeleteComment(state, post, comment, userId = currentUserId(state)) {
  if (!comment || !userId) return false;
  return comment.authorId === userId || canAccessPost(state, post, userId);
}

export function filterOwnedPets(state, userId = currentUserId(state)) {
  return userId ? state.pets.filter(pet => pet.ownerId === userId) : [];
}

export function filterOwnedPetResources(state, resources, userId = currentUserId(state)) {
  const petIds = userPetIds(state, userId);
  return resources.filter(item => petIds.has(item.petId));
}

export function filterAccessiblePosts(state, posts, userId = currentUserId(state)) {
  return posts.filter(post => canAccessPost(state, post, userId));
}
