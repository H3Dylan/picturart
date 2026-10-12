/**
 * Position à afficher dans la visionneuse. Le paramètre d'adresse est un numéro (« 2 ») ou,
 * depuis un profil, l'identifiant du média. Hors limites ou inconnu : la première photo.
 */
export function viewerPosition(param: string, mediaIds: readonly string[]) {
  const position = /^\d+$/.test(param) ? Number(param) : mediaIds.indexOf(param);
  return position >= 0 && position < Math.max(1, mediaIds.length) ? position : 0;
}
