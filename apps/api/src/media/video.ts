import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { media } from '../db/schema.ts';
import { type MediaContext, type MediaRow, saveVariant, writeImageVariants } from './processor.ts';
import { run } from './tools.ts';

/** Version de lecture : côté court 1080 px au plus, côté long 1920 px au plus. */
const SHORT_SIDE = 1080;
const LONG_SIDE = 1920;
const HDR_TRANSFERS = new Set(['arib-std-b67', 'smpte2084']);

/**
 * HDR (HLG des iPhone, PQ) vers SDR BT.709 : passage en lumière linéaire, conversion des
 * primaires BT.2020 → BT.709 puis tonemapping « hable ». Sans cela, couleurs délavées.
 * Le tonemapping matériel (tonemap_vaapi) n'accepte que le HDR10 avec métadonnées, pas le HLG.
 */
const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';

export interface VideoProbe {
  /** Dimensions codées, avant rotation. */
  width: number;
  height: number;
  /** Rotation à appliquer, en degrés dans le sens horaire : 0, 90, 180 ou 270. */
  rotation: number;
  durationMs: number | null;
  hdr: boolean;
  tenBit: boolean;
  takenAt: Date | null;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  color_transfer?: string;
  duration?: string;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
}

export async function probeVideo(ctx: MediaContext, path: string): Promise<VideoProbe> {
  const { stdout } = await run(
    ctx.tools.FFPROBE_PATH,
    ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path],
    { timeoutMs: 60_000, signal: ctx.signal },
  );
  const data = JSON.parse(stdout) as {
    streams?: FfprobeStream[];
    format?: { duration?: string; tags?: Record<string, string> };
  };
  const video = data.streams?.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video?.width || !video.height) throw new Error('aucune piste vidéo lisible');

  // ffprobe donne la rotation d'affichage dans le sens antihoraire (iPhone en portrait : -90)
  const displayRotation =
    video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
    Number(video.tags?.rotate ?? 0);
  const rotation = (((Math.round(-displayRotation / 90) * 90) % 360) + 360) % 360;

  const seconds = Number(data.format?.duration ?? video.duration);
  const tags = { ...data.format?.tags, ...video.tags };
  // Date Apple (avec fuseau) en priorité, sinon la date de création du conteneur
  const rawDate = tags['com.apple.quicktime.creationdate'] ?? tags.creation_time;
  const takenAt = rawDate ? new Date(rawDate) : null;

  return {
    width: video.width,
    height: video.height,
    rotation,
    durationMs: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
    hdr: HDR_TRANSFERS.has(video.color_transfer ?? ''),
    tenBit: /1[02]/.test(video.pix_fmt ?? ''),
    takenAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
  };
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/** Dimensions de sortie : affichées (après rotation) et codées (avant rotation, pour le redimensionnement). */
export function outputSize(probe: VideoProbe) {
  const quarter = probe.rotation === 90 || probe.rotation === 270;
  const displayWidth = quarter ? probe.height : probe.width;
  const displayHeight = quarter ? probe.width : probe.height;
  const scale = Math.min(
    1,
    SHORT_SIDE / Math.min(displayWidth, displayHeight),
    LONG_SIDE / Math.max(displayWidth, displayHeight),
  );
  const width = even(displayWidth * scale);
  const height = even(displayHeight * scale);
  return {
    displayWidth,
    displayHeight,
    width,
    height,
    codedWidth: quarter ? height : width,
    codedHeight: quarter ? width : height,
  };
}

function rotationFilter(rotation: number) {
  if (rotation === 90) return 'transpose=clock';
  if (rotation === 270) return 'transpose=cclock';
  if (rotation === 180) return 'hflip,vflip';
  return null;
}

/** Arguments ffmpeg : QuickSync via VA-API (`vaapi`) ou entièrement logiciel (`software`). */
export function transcodeArgs(
  probe: VideoProbe,
  input: string,
  output: string,
  mode: 'vaapi' | 'software',
  device: string,
) {
  const size = outputSize(probe);
  const colour = [probe.hdr ? TONEMAP : null, rotationFilter(probe.rotation)].filter(
    (filter): filter is string => filter !== null,
  );
  // La rotation est appliquée par le filtre transpose : la matrice d'affichage d'origine est
  // neutralisée, sinon ffmpeg 6 la recopie dans la sortie et les lecteurs tourneraient deux fois
  const inputArgs = ['-noautorotate', '-display_rotation', '0', '-i', input];
  const common = [
    ...['-map', '0:v:0', '-map', '0:a:0?'],
    // Aucune métadonnée recopiée dans la version de lecture (position GPS des iPhone)
    ...['-map_metadata', '-1', '-map_chapters', '-1', '-dn', '-sn'],
    ...['-fpsmax', '60'],
    ...['-c:a', 'aac', '-b:a', '160k', '-ac', '2'],
    ...['-movflags', '+faststart'],
    output,
  ];

  if (mode === 'vaapi') {
    // Décodage et réduction sur l'iGPU, couleurs et rotation sur le CPU (en 1080p, c'est léger),
    // encodage H.264 sur l'iGPU
    const filters = [
      `scale_vaapi=w=${size.codedWidth}:h=${size.codedHeight}:format=${probe.tenBit ? 'p010' : 'nv12'}`,
      'hwdownload',
      `format=${probe.tenBit ? 'p010le' : 'nv12'}`,
      ...colour,
      'format=nv12',
      'hwupload',
    ];
    return [
      ...['-hide_banner', '-loglevel', 'error', '-y'],
      ...['-init_hw_device', `vaapi=va:${device}`, '-filter_hw_device', 'va'],
      ...['-hwaccel', 'vaapi', '-hwaccel_device', 'va', '-hwaccel_output_format', 'vaapi'],
      ...inputArgs,
      ...['-vf', filters.join(',')],
      ...['-c:v', 'h264_vaapi', '-profile:v', 'high', '-qp', '23'],
      ...common,
    ];
  }

  const filters = [`scale=${size.codedWidth}:${size.codedHeight}`, ...colour, 'format=yuv420p'];
  return [
    ...['-hide_banner', '-loglevel', 'error', '-y'],
    ...inputArgs,
    ...['-vf', filters.join(',')],
    ...['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-profile:v', 'high'],
    ...common,
  ];
}

function hardwareMode(ctx: MediaContext): 'vaapi' | 'software' {
  const { VIDEO_HWACCEL, VAAPI_DEVICE } = ctx.tools;
  if (VIDEO_HWACCEL === 'none') return 'software';
  if (VIDEO_HWACCEL === 'vaapi') return 'vaapi';
  return existsSync(VAAPI_DEVICE) ? 'vaapi' : 'software';
}

/**
 * Vidéo : version de lecture MP4 H.264 (1080p, SDR, rotation appliquée, sans métadonnées),
 * image d'aperçu et vignette. L'original (HEVC, HDR, 4K…) reste intact pour le téléchargement.
 */
export async function processVideo(ctx: MediaContext, row: MediaRow) {
  if (!row.originalPath) throw new Error('média sans original');
  const original = ctx.storage.abs(row.originalPath);
  const probe = await probeVideo(ctx, original);
  const size = outputSize(probe);
  const dir = await ctx.storage.workDir(row.id);
  const encoded = join(dir, 'video.mp4');
  const timeoutMs = Math.max(10 * 60_000, (probe.durationMs ?? 0) * 6);

  let mode = hardwareMode(ctx);
  const started = Date.now();
  const transcode = () =>
    run(
      ctx.tools.FFMPEG_PATH,
      transcodeArgs(probe, original, encoded, mode, ctx.tools.VAAPI_DEVICE),
      { timeoutMs, signal: ctx.signal },
    );
  try {
    await transcode();
  } catch (error) {
    if (mode === 'software' || ctx.signal?.aborted) throw error;
    // Codec non géré par l'iGPU, pilote absent… : on retente en logiciel
    ctx.log.warn(
      { err: error, mediaId: row.id },
      'transcodage matériel impossible, repli logiciel',
    );
    mode = 'software';
    await transcode();
  }
  ctx.log.info(
    {
      mediaId: row.id,
      mode,
      hdr: probe.hdr,
      durationMs: probe.durationMs,
      ms: Date.now() - started,
    },
    'vidéo transcodée',
  );

  // Image d'aperçu tirée de la version de lecture : déjà en SDR et dans le bon sens
  const poster = join(dir, 'poster.png');
  const at = Math.min(1, (probe.durationMs ?? 0) / 2000);
  await run(
    ctx.tools.FFMPEG_PATH,
    [
      ...['-hide_banner', '-loglevel', 'error', '-y'],
      ...['-ss', String(at), '-i', encoded],
      ...['-frames:v', '1', '-update', '1', poster],
    ],
    { timeoutMs: 60_000, signal: ctx.signal },
  );
  await writeImageVariants(ctx, row.id, poster);

  const videoPath = ctx.storage.derivedPath(row.id, 'video', 'mp4');
  await ctx.storage.move(encoded, videoPath);
  await saveVariant(ctx.db, row.id, 'video', {
    path: videoPath,
    width: size.width,
    height: size.height,
    sizeBytes: (await stat(ctx.storage.abs(videoPath))).size,
  });

  await ctx.db
    .update(media)
    .set({
      status: 'ready',
      width: size.displayWidth,
      height: size.displayHeight,
      durationMs: probe.durationMs,
      takenAt: probe.takenAt,
      sizeBytes: (await stat(original)).size,
      error: null,
    })
    .where(eq(media.id, row.id));
}
