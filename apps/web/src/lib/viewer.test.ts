import { describe, expect, it } from 'vitest';
import { viewerPosition } from './viewer.ts';

describe('position dans la visionneuse', () => {
  const ids = ['a1', 'b2', 'c3'];

  it('suit le numéro de l’adresse (glisser vers la photo suivante)', () => {
    expect(viewerPosition('0', ids)).toBe(0);
    expect(viewerPosition('1', ids)).toBe(1);
    expect(viewerPosition('2', ids)).toBe(2);
    expect(viewerPosition('12', [...ids, ...Array.from({ length: 10 }, (_, i) => `x${i}`)])).toBe(
      12,
    );
  });

  it('accepte l’identifiant d’un média (lien depuis un profil)', () => {
    expect(viewerPosition('c3', ids)).toBe(2);
  });

  it('retombe sur la première photo si l’adresse ne correspond à rien', () => {
    expect(viewerPosition('9', ids)).toBe(0);
    expect(viewerPosition('inconnu', ids)).toBe(0);
  });

  it('pendant le chargement du post, première photo', () => {
    expect(viewerPosition('2', [])).toBe(0);
  });
});
