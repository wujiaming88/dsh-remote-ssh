// Inline Markdown image: a thumbnail button that opens a zoomable ui.Modal.
// Images are never navigation targets, so no anchor link is rendered here.
// Escape/backdrop/focus are owned by ui.Modal's dialog; this component adds
// only zoom state, loading, and image error/retry.
import React from 'react';
import { h, ui } from './shared.js';
import { outputImageSource } from './output-image-model.js';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.5;

export function OutputImage({ href, alt = '', title, request, t }) {
  // Freeze the proof window at the first complete image token. Later text chunks
  // advance the item's lastSeq, but the original event range still contains this
  // exact reference and must not make the browser fetch the image again.
  const source = React.useMemo(() => outputImageSource(request, href), [href, request?.id, request?.generation]);
  const [open, setOpen] = React.useState(false);
  const [thumbState, setThumbState] = React.useState('loading');
  const [thumbAttempt, setThumbAttempt] = React.useState(0);
  const [previewState, setPreviewState] = React.useState('loading');
  const [previewAttempt, setPreviewAttempt] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);

  const closeLabel = t('acp.close');
  const unavailable = t('acp.imagePreviewUnavailable');
  const retryLabel = t('acp.retryImagePreview');
  const loadingLabel = t('acp.imagePreviewLoading');

  if (!source) {
    return h('span', { className: 'rssh-output-image-unavailable', title: title || alt }, unavailable);
  }

  const openPreview = () => {
    setZoom(1);
    setPreviewState('loading');
    setPreviewAttempt(value => value + 1);
    setOpen(true);
  };
  const retryThumb = () => {
    setThumbState('loading');
    setThumbAttempt(value => value + 1);
  };
  const retryPreview = () => {
    setPreviewState('loading');
    setPreviewAttempt(value => value + 1);
  };

  const thumb = thumbState === 'error'
    ? h('button', { type: 'button', className: 'rssh-output-image-thumb rssh-output-image-thumb-error',
        title: `${unavailable} · ${retryLabel}`, 'aria-label': `${alt || unavailable} · ${retryLabel}`, onClick: retryThumb },
        h('span', { className: 'rssh-output-image-error-label' }, unavailable),
        h('span', { className: 'rssh-output-image-retry-label' }, retryLabel))
    : h('button', { type: 'button', className: 'rssh-output-image-thumb',
        title: title || alt, 'aria-label': title || alt || unavailable, onClick: openPreview },
        thumbState !== 'ready' ? h('span', { className: 'rssh-output-image-loading', role: 'status' }, loadingLabel) : null,
        h('img', { key: thumbAttempt, className: 'rssh-output-image-thumb-img', src: source.src, alt: alt,
          decoding: 'async', loading: 'lazy', draggable: false,
          onLoad: () => setThumbState('ready'), onError: () => setThumbState('error') }));

  const zoomPercent = `${Math.round(zoom * 100)}%`;
  const toolbar = h('div', { className: 'rssh-output-image-toolbar' },
    h('button', { type: 'button', className: 'rssh-output-image-zoom', 'aria-label': t('acp.zoomOut'), title: t('acp.zoomOut'),
      disabled: zoom <= ZOOM_MIN, onClick: () => setZoom(value => Math.max(ZOOM_MIN, value - ZOOM_STEP)) }, '−'),
    h('span', { className: 'rssh-output-image-zoom-value', role: 'status' }, zoomPercent),
    h('button', { type: 'button', className: 'rssh-output-image-zoom', 'aria-label': t('acp.zoomIn'), title: t('acp.zoomIn'),
      disabled: zoom >= ZOOM_MAX, onClick: () => setZoom(value => Math.min(ZOOM_MAX, value + ZOOM_STEP)) }, '+'),
    h('button', { type: 'button', className: 'rssh-output-image-reset', 'aria-label': t('acp.resetZoom'), title: t('acp.resetZoom'),
      disabled: zoom === 1, onClick: () => setZoom(1) }, t('acp.resetZoom')));

  const stage = previewState === 'error'
    ? h('button', { type: 'button', className: 'rssh-output-image-stage-error', onClick: retryPreview },
        h('span', { className: 'rssh-output-image-error-label' }, unavailable),
        h('span', { className: 'rssh-output-image-retry-label' }, retryLabel))
    : h('div', { className: 'rssh-output-image-stage' },
        h('img', { key: previewAttempt, className: 'rssh-output-image-stage-img', src: source.src, alt: alt,
          style: { transform: `scale(${zoom})` }, decoding: 'async', draggable: false,
          'data-loaded': previewState === 'ready' ? '' : undefined,
          onLoad: () => setPreviewState('ready'), onError: () => setPreviewState('error') }),
        previewState !== 'ready'
          ? h('span', { className: 'rssh-output-image-loading', role: 'status' }, loadingLabel)
          : null);

  const modal = open
    ? h(ui.Modal, { open: true, className: 'rssh-output-image-modal', title: alt || title,
        closeLabel, onClose: () => setOpen(false) },
        toolbar,
        stage)
    : null;

  return h(React.Fragment, null, thumb, modal);
}
