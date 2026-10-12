import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EventSummary, MediaDto, PostDto } from '@picturart/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { media as mediaTable } from '../src/db/schema.ts';
import { detectFormat } from '../src/media/sniff.ts';
import { hasTool, run } from '../src/media/tools.ts';
import { outputSize, transcodeArgs, type VideoProbe } from '../src/media/video.ts';
import { createTestApp, ORIGIN, tusUpload } from './helpers.ts';

const FFMPEG = await hasTool('ffmpeg');
const HEIF_DEC = process.env.HEIF_DEC_PATH ?? 'heif-dec';
const HEIF = await hasTool(HEIF_DEC, '--version');
const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url));

describe('reconnaissance du format par les premiers octets', () => {
  const box = (major: string, ...compatible: string[]) => {
    const brands = [major, '\0\0\0\0', ...compatible].join('');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(8 + brands.length);
    return Buffer.concat([size, Buffer.from(`ftyp${brands}`, 'latin1'), Buffer.alloc(16)]);
  };

  it('photos', async () => {
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
      .jpeg()
      .toBuffer();
    expect(detectFormat(jpeg)?.mime).toBe('image/jpeg');
    expect(detectFormat(await fixture('iphone-portrait.heic'))).toEqual({
      kind: 'photo',
      mime: 'image/heic',
      extension: 'heic',
    });
    expect(detectFormat(box('mif1', 'heic'))?.mime).toBe('image/heic');
  });

  it('vidéos MP4 et MOV', () => {
    expect(detectFormat(box('qt  ', 'qt  '))).toMatchObject({ kind: 'video', extension: 'mov' });
    expect(detectFormat(box('isom', 'iso2', 'avc1', 'mp41'))).toMatchObject({
      kind: 'video',
      mime: 'video/mp4',
    });
  });

  it('refuse le reste, AVIF et audio compris', () => {
    expect(detectFormat(Buffer.from('%PDF-1.7 ...'))).toBeNull();
    expect(detectFormat(box('avif', 'mif1'))).toBeNull();
    expect(detectFormat(box('M4A ', 'isom'))).toBeNull();
  });
});

describe('paramètres de transcodage', () => {
  const probe = (over: Partial<VideoProbe>): VideoProbe => ({
    width: 3840,
    height: 2160,
    rotation: 0,
    durationMs: 10_000,
    hdr: false,
    tenBit: false,
    takenAt: null,
    ...over,
  });

  it('iPhone en portrait : 1080×1920, rotation appliquée après réduction', () => {
    const portrait = probe({ rotation: 90 });
    expect(outputSize(portrait)).toMatchObject({
      displayWidth: 2160,
      displayHeight: 3840,
      width: 1080,
      height: 1920,
      codedWidth: 1920,
      codedHeight: 1080,
    });
    const vf = transcodeArgs(portrait, 'in.mov', 'out.mp4', 'vaapi', '/dev/dri/renderD128');
    expect(vf.join(' ')).toContain(
      'scale_vaapi=w=1920:h=1080:format=nv12,hwdownload,format=nv12,transpose=clock,format=nv12,hwupload',
    );
  });

  it('HDR 10 bits : tonemapping vers le SDR, sans métadonnées recopiées', () => {
    const args = transcodeArgs(
      probe({ hdr: true, tenBit: true }),
      'in.mov',
      'out.mp4',
      'software',
      '',
    );
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf).toMatch(/^scale=1920:1080,zscale=t=linear.*tonemap=hable.*,format=yuv420p$/);
    expect(args).toEqual(expect.arrayContaining(['-map_metadata', '-1', 'libx264']));
  });

  it('ne grossit jamais une petite vidéo', () => {
    expect(outputSize(probe({ width: 640, height: 360 }))).toMatchObject({
      width: 640,
      height: 360,
    });
  });
});

describe('envoi de vidéos et de HEIC', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let base: string;
  let cookie: string;
  let event: EventSummary;
  let work: string;

  const inject = (method: string, url: string, payload?: object, headers = {}) =>
    t.app.inject({
      method: method as 'GET',
      url,
      headers: { cookie, origin: ORIGIN, ...headers },
      ...(payload && { payload }),
    });

  /** Crée un post d'un fichier, l'envoie, attend le worker et renvoie le média. */
  async function send(
    name: string,
    type: string,
    body: Buffer,
  ): Promise<MediaDto & { error?: string | null }> {
    const created = await inject('POST', '/api/v1/posts', {
      eventId: event.id,
      files: [{ name, size: body.length, type }],
    });
    expect(created.statusCode).toBe(201);
    const post: PostDto = created.json();
    const mediaId = post.media[0]?.id ?? '';
    expect((await tusUpload(base, cookie, mediaId, body, name)).statusCode).toBe(204);
    await t.app.mediaWorker?.idle();
    const reloaded: PostDto = (await inject('GET', `/api/v1/posts/${post.id}`)).json();
    if (reloaded.media[0]) return reloaded.media[0];
    // Les médias en échec n'apparaissent plus dans le post : on lit la base
    const [row] = await t.database.db.select().from(mediaTable).where(eq(mediaTable.id, mediaId));
    return { ...(row as unknown as MediaDto), error: row?.error ?? null };
  }

  const ffprobe = async (file: string) =>
    JSON.parse(
      (
        await run('ffprobe', [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_streams',
          '-show_format',
          file,
        ])
      ).stdout,
    );

  beforeAll(async () => {
    t = await createTestApp();
    base = await t.app.listen({ port: 0, host: '127.0.0.1' });
    work = await mkdtemp(join(tmpdir(), 'picturart-video-'));
    await t.createUser('Léa', 'lea@exemple.fr');
    cookie = await t.login('lea@exemple.fr');
    event = (await inject('POST', '/api/v1/events', { name: 'Festival' })).json();
  });
  afterAll(async () => {
    await t.close();
    await rm(work, { recursive: true, force: true });
  });

  it('un fichier vidéo illisible finit en échec, sans bloquer la file', async () => {
    const junk = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypisom\0\0\0\0isomavc1', 'latin1'),
      Buffer.alloc(4096, 7),
    ]);
    const media = await send('casse.mp4', 'video/mp4', junk);
    expect(media).toMatchObject({ kind: 'video', status: 'failed' });
    expect(media.error).toBeTruthy();
  });

  it.skipIf(!FFMPEG)(
    'vidéo tournée (portrait) : version de lecture droite, aperçu et durée',
    async () => {
      const flat = join(work, 'flat.mp4');
      const rotated = join(work, 'portrait.mov');
      await run('ffmpeg', [
        ...['-hide_banner', '-loglevel', 'error', '-y'],
        ...['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-f', 'lavfi', '-i', 'sine=d=2'],
        ...['-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', flat],
      ]);
      // Rotation d'affichage de 90° (sens antihoraire), comme un téléphone tenu à la verticale
      await run('ffmpeg', [
        ...['-hide_banner', '-loglevel', 'error', '-y', '-display_rotation', '90', '-i', flat],
        ...['-c', 'copy', '-metadata', 'creation_time=2026-08-03T10:00:00Z', rotated],
      ]);

      const media = await send('portrait.mov', 'video/quicktime', await readFile(rotated));
      expect(media).toMatchObject({ kind: 'video', status: 'ready', width: 240, height: 320 });
      expect(media.durationMs).toBeGreaterThan(1900);
      expect(media.durationMs).toBeLessThan(2200);
      expect(media.takenAt).toBe('2026-08-03T10:00:00.000Z');

      // Lecture en streaming : requêtes partielles (Range) acceptées
      const partial = await inject('GET', `/api/v1/media/${media.id}/video`, undefined, {
        range: 'bytes=0-99',
      });
      expect(partial.statusCode).toBe(206);
      expect(partial.headers['content-type']).toBe('video/mp4');
      expect(partial.rawPayload.length).toBe(100);

      const full = await inject('GET', `/api/v1/media/${media.id}/video`);
      const played = join(work, 'played.mp4');
      await import('node:fs/promises').then((fs) => fs.writeFile(played, full.rawPayload));
      const info = await ffprobe(played);
      const video = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
      expect(video).toMatchObject({ codec_name: 'h264', width: 240, height: 320 });
      expect(video.side_data_list ?? []).not.toContainEqual(
        expect.objectContaining({ rotation: expect.anything() }),
      );
      expect(info.format.tags?.creation_time).toBeUndefined();

      const thumb = await inject('GET', `/api/v1/media/${media.id}/thumb`);
      expect(await sharp(thumb.rawPayload).metadata()).toMatchObject({ width: 240, height: 320 });
    },
  );

  it.skipIf(!FFMPEG)('vidéo HDR (HLG 10 bits) : convertie en SDR 8 bits', async () => {
    const hdr = join(work, 'hdr.mov');
    try {
      await run('ffmpeg', [
        ...['-hide_banner', '-loglevel', 'error', '-y'],
        ...['-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-t', '1'],
        ...['-pix_fmt', 'yuv420p10le', '-c:v', 'libx265', '-tag:v', 'hvc1'],
        ...[
          '-x265-params',
          'log-level=none:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc',
        ],
        hdr,
      ]);
    } catch {
      return; // ffmpeg sans libx265 : rien à tester ici
    }
    const media = await send('hdr.mov', 'video/quicktime', await readFile(hdr));
    expect(media).toMatchObject({ status: 'ready', width: 320, height: 240 });
    const full = await inject('GET', `/api/v1/media/${media.id}/video`);
    const played = join(work, 'hdr-played.mp4');
    await import('node:fs/promises').then((fs) => fs.writeFile(played, full.rawPayload));
    const video = (await ffprobe(played)).streams[0];
    expect(video.pix_fmt).toBe('yuv420p');
    expect(video.color_transfer).not.toBe('arib-std-b67');
  });

  it.skipIf(!HEIF)('photo HEIC d’iPhone : décodée, tournée, date conservée', async () => {
    const heic = await fixture('iphone-portrait.heic');
    const media = await send('IMG_0001.HEIC', 'image/heic', heic);
    expect(media).toMatchObject({ kind: 'photo', status: 'ready', width: 480, height: 640 });
    expect(media.takenAt?.startsWith('2026-08-0')).toBe(true);

    // Moitié rouge de l'image en haut une fois tournée (orientation EXIF 6 + irot)
    const display = await inject('GET', `/api/v1/media/${media.id}/display`);
    const { data, info } = await sharp(display.rawPayload)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 480, height: 640 });
    const at = (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3),
    ];
    const [r, , b] = at(240, 40);
    expect(r).toBeGreaterThan(150);
    expect(b).toBeLessThan(100);

    // L'original reste le HEIC envoyé, octet pour octet
    const original = await inject('GET', `/api/v1/media/${media.id}/original`);
    expect(original.headers['content-type']).toBe('image/heic');
    expect(Buffer.compare(original.rawPayload, heic)).toBe(0);
  });
});
