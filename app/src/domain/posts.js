export function createPost({ uid, authorId, petId, content, imageData = '' }) {
  return {
    id: uid('post'),
    authorId,
    petId,
    content,
    imageData,
    likedBy: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
}

export function createComment({ uid, authorId, content }) {
  return {
    id: uid('cm'),
    authorId,
    content,
    createdAt: new Date().toISOString()
  };
}

export function togglePostLike({ post, userId }) {
  const index = post.likedBy.indexOf(userId);
  if (index >= 0) post.likedBy.splice(index, 1);
  else post.likedBy.push(userId);
}
